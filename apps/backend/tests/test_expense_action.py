"""ACT-8: logging an expense is a real action: proposed or run at once, receipted with its source moment, undoable.
"Log this receipt" (a request) runs without a yes (ACT-4) but leaves a receipt; a receipt seen by the camera is
only suggested; a mode may run those on its own; edits are checked; the Expenses list stays in step."""
from core import db
from skills import suggest
from tests.contract_check import validate
from tests.test_done_when import post_moment

SRC = ["mom_seed_006"]


def expenses(c):
    return next(x for x in validate(c.get("/lists"), "/lists", "get", 200)["items"] if x["id"] == "expenses")


def acts(c, **q):
    return [a for a in validate(c.get("/actions", params=q), "/actions", "get", 200)["items"] if a["type"] == "expense"]


def propose(c, **extra):
    body = {"type": "expense", "title": "Lunch", "source_moment_ids": SRC, "mode": "life",
            "expense": {"label": "Lunch", "amount": 12.4}, **extra}
    return validate(c.post("/actions/propose", json=body), "/actions/propose", "post", 201)


def test_propose_confirm_undo_writes_and_removes_the_list_item(seeded):
    before = len(expenses(seeded)["items"])
    act = propose(seeded)
    assert act["status"] == "proposed" and act["expense"] == {"label": "Lunch", "amount": 12.4}
    assert len(expenses(seeded)["items"]) == before  # nothing is logged until the yes
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"}),
                   "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "done" and res["action"]["external"]["provider"] == "cortex_list"
    assert "$12.40 for Lunch" in res["receipt"]["summary"] and res["receipt"]["undo"]["available"]
    lst = expenses(seeded)
    item = next(i for i in lst["items"] if i["action_id"] == act["id"])
    assert item["amount"] == 12.4 and item["source_moment_id"] == SRC[0] and len(lst["items"]) == before + 1
    undone = validate(seeded.post(f"/actions/{act['id']}/undo"), "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone" and "Removed" in undone["receipt"]["summary"]
    assert len(expenses(seeded)["items"]) == before


def test_undo_still_works_if_the_item_was_deleted_by_hand(seeded):
    act = propose(seeded)
    seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"})
    item = next(i for i in expenses(seeded)["items"] if i["action_id"] == act["id"])
    assert seeded.delete(f"/lists/expenses/items/{item['id']}").status_code == 200
    assert seeded.post(f"/actions/{act['id']}/undo").status_code == 200


def test_edits_change_the_label_and_amount_and_are_checked(seeded):
    act = propose(seeded)
    url = f"/actions/{act['id']}/confirm"
    assert seeded.post(url, json={"deliver": "do", "expense": {"amount": -3}}).status_code == 400
    ok = validate(seeded.post(url, json={"deliver": "do", "expense": {"label": "Team lunch", "amount": 18.75}}),
                  "/actions/{id}/confirm", "post", 200)
    assert ok["action"]["title"] == "Log $18.75 for Team lunch" and ok["action"]["expense"]["amount"] == 18.75
    assert any(i["text"] == "Team lunch" and i["amount"] == 18.75 for i in expenses(seeded)["items"])


def test_a_receipt_without_a_total_can_still_be_logged_and_negative_amounts_are_refused(seeded):
    act = propose(seeded, expense={"label": "Coffee", "amount": None})
    assert act["title"] == "Lunch" and act["expense"]["amount"] is None
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "done"
    r = seeded.post("/actions/propose", json={"type": "expense", "title": "x", "source_moment_ids": SRC,
                                              "expense": {"label": "x", "amount": -1}})
    assert r.status_code == 400 or r.status_code == 422


def test_log_this_receipt_runs_at_once_but_leaves_a_receipt_and_undo(seeded):
    m = post_moment(seeded, "Log this receipt, I spent $14.50 on lunch.")
    items = acts(seeded)
    mine = [a for a in items if m["id"] in a["source_moment_ids"]]
    assert len(mine) == 1 and mine[0]["status"] == "done" and mine[0]["expense"]["amount"] == 14.5
    rcp = db.col("receipts").find_one({"action_id": mine[0]["id"]})
    assert rcp["undo"]["available"] is True and rcp["source_moment_ids"] == [m["id"]]
    assert any(i["action_id"] == mine[0]["id"] for i in expenses(seeded)["items"])
    seeded.post(f"/actions/{mine[0]['id']}/undo")
    assert not any(i.get("action_id") == mine[0]["id"] for i in expenses(seeded)["items"])


def test_deleting_the_moment_removes_the_expense_too(seeded):
    m = post_moment(seeded, "I spent $9 on tacos.")
    assert any(m["id"] == i["source_moment_id"] for i in expenses(seeded)["items"])
    seeded.delete(f"/moments/{m['id']}")
    assert not any(m["id"] == i["source_moment_id"] for i in expenses(seeded)["items"])
    assert not [a for a in acts(seeded) if m["id"] in a["source_moment_ids"]]


def test_a_seen_receipt_is_suggested_once_and_a_mode_can_run_it_on_its_own(seeded):
    seeded.patch("/modes/life", json={"auto_run": []})
    mom = db.col("moments").find_one({"_id": "mom_seed_006"})
    mom["mode"] = "life"
    item = {"type": "expense", "title": "Campus Coffee", "amount": 6.25, "confidence": 0.9}
    made = suggest.from_perception([item, item], mom)
    assert len(made) == 1 and made[0]["status"] == "proposed" and made[0]["expense"]["label"] == "Campus Coffee"
    assert suggest.from_perception([{**item, "amount": None}], mom) == []  # no readable total: nothing to log
    seeded.post(f"/actions/{made[0]['id']}/dismiss")
    assert seeded.patch("/modes/life", json={"auto_run": ["expense"]}).status_code == 200
    again = suggest.from_perception([{**item, "title": "Bookstore", "amount": 31.0}], mom)
    assert again[0]["status"] == "done" and again[0]["auto"] is True
    assert any(i["text"] == "Bookstore" and i["amount"] == 31.0 for i in expenses(seeded)["items"])


def test_voice_yes_logs_a_suggested_expense(seeded):
    seeded.post("/modes/life/activate")
    act = propose(seeded)
    out = validate(seeded.post("/ask", json={"question": "yes", "channel": "voice"}), "/ask", "post", 200)
    assert "Logged $12.40 for Lunch" in out["spoken"]
    assert any(i.get("action_id") == act["id"] for i in expenses(seeded)["items"])
