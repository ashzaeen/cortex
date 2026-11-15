"""Shared memory and retrieval extras from the feature spec: MEM-4 (edit and delete a card), MEM-9 (daily
digest), MEM-10 (rewind), MEM-11 (lists) and their cascade delete (MEM-12). Offline, contract-validated."""
from core import events
from core.timeutil import iso, now
from tests.contract_check import validate

TS = "2026-11-15T14:02:11-06:00"


def post(c, transcript, ts=TS):
    return validate(c.post("/moments", json={"ts": ts, "source": "glasses", "transcript": transcript}),
                    "/moments", "post", 201)


def lists(c):
    return {x["id"]: x for x in validate(c.get("/lists"), "/lists", "get", 200)["items"]}


def ask(c, q):
    return validate(c.post("/ask", json={"question": q, "channel": "voice"}), "/ask", "post", 200)


# ---------- MEM-3 / MEM-10: one moment by id ----------
def test_get_moment_by_id(seeded):
    m = validate(seeded.get("/moments/mom_seed_003"), "/moments/{id}", "get", 200)
    assert m["id"] == "mom_seed_003" and "keys" in m["transcript"]
    validate(seeded.get("/moments/mom_nope"), "/moments/{id}", "get", 404)


# ---------- MEM-11: lists ----------
def test_seeded_shopping_moment_fills_the_list_once(seeded):
    shop = lists(seeded)["shopping"]
    assert sorted(i["text"] for i in shop["items"]) == ["batteries", "oat milk"]
    assert {i["source_moment_id"] for i in shop["items"]} == {"mom_seed_007"}
    assert len(lists(seeded)["shopping"]["items"]) == 2  # the one-time scan does not repeat


def test_voice_fills_lists_and_hand_edits_work(seeded):
    m = post(seeded, "Add eggs, bread and coffee to my shopping list.")
    shop = lists(seeded)["shopping"]
    assert {"eggs", "bread", "coffee"} <= {i["text"] for i in shop["items"]}
    assert "list.updated" in [e["type"] for e in events.history]

    post(seeded, "Log this receipt, I spent $12.50 on lunch.")
    exp = lists(seeded)["expenses"]
    assert exp["items"][0]["amount"] == 12.5 and exp["items"][0]["text"] == "lunch" and exp["total"] == 12.5

    item = validate(seeded.post("/lists/shopping/items", json={"text": "apples"}), "/lists/{id}/items", "post", 201)
    assert item["source_moment_id"] is None
    done = validate(seeded.patch(f"/lists/shopping/items/{item['id']}", json={"done": True}),
                    "/lists/{id}/items/{item_id}", "patch", 200)
    assert done["done"] is True
    validate(seeded.delete(f"/lists/shopping/items/{item['id']}"), "/lists/{id}/items/{item_id}", "delete", 200)
    validate(seeded.delete(f"/lists/shopping/items/{item['id']}"), "/lists/{id}/items/{item_id}", "delete", 404)
    assert seeded.post("/lists/chores/items", json={"text": "x"}).status_code == 404

    # MEM-12: deleting the moment deletes the items it added
    rcp = validate(seeded.delete(f"/moments/{m['id']}"), "/moments/{id}", "delete", 200)
    assert "3 list items" in rcp["summary"]
    assert not {"eggs", "bread", "coffee"} & {i["text"] for i in lists(seeded)["shopping"]["items"]}


def test_ask_reads_the_shopping_list_with_proof(seeded):
    a = ask(seeded, "What's on my shopping list?")
    assert a["grounded"] and "oat milk" in a["spoken"] and a["sources"][0]["id"] == "mom_seed_007"


# ---------- MEM-9: daily digest ----------
def test_digest_for_a_day(seeded):
    post(seeded, "This is Ash from Acme.")
    post(seeded, "I'll send you the deck Friday.", ts="2026-11-15T14:02:40-06:00")
    post(seeded, "Add limes to the shopping list.", ts="2026-11-15T15:00:00-06:00")
    d = validate(seeded.get("/digest", params={"date": "2026-11-15"}), "/digest", "get", 200)
    assert d["moment_count"] == 3 and [p["name"] for p in d["people"]] == ["Ash"]
    assert any("Met Ash from Acme" in b for b in d["bullets"])
    assert any("deck" in p["what"].lower() for p in d["promises"])
    assert any("limes" in b for b in d["bullets"])
    assert len(d["source_moment_ids"]) == 3

    empty = validate(seeded.get("/digest", params={"date": "2020-01-01"}), "/digest", "get", 200)
    assert empty["moment_count"] == 0 and "don't have anything" in empty["spoken"]
    validate(seeded.get("/digest", params={"date": "not-a-date"}), "/digest", "get", 400)


def test_ask_what_did_i_do_today(seeded):
    post(seeded, "This is Ash from Acme.", ts=iso(now()))
    a = ask(seeded, "What did I do today?")
    assert a["grounded"] and "Ash" in a["spoken"] and a["sources"]
    receipts = validate(seeded.get("/receipts"), "/receipts", "get", 200)["items"]
    assert receipts[0]["id"] == a["receipt_id"] and receipts[0]["kind"] == "answer"


# ---------- MEM-10: rewind ----------
def test_rewind_quotes_the_exact_line(seeded):
    post(seeded, "This is Ash from Acme.")
    said = post(seeded, "Great booth. I'll send you the deck Friday. Talk soon.", ts="2026-11-15T14:02:40-06:00")
    r = validate(seeded.get("/rewind", params={"q": "Rewind what Ash said about the deck"}), "/rewind", "get", 200)
    assert r["found"] and r["moment"]["id"] == said["id"]
    assert r["line"] == "I'll send you the deck Friday." and r["line"] in r["spoken"] and "Ash" in r["spoken"]

    a = ask(seeded, "Replay what Ash said about the deck")
    assert a["grounded"] and a["sources"][0]["id"] == said["id"] and "I'll send you the deck Friday." in a["spoken"]


def test_rewind_without_a_match(seeded):
    r = validate(seeded.get("/rewind", params={"q": "replay the zebra parade"}), "/rewind", "get", 200)
    assert r == {"found": False, "moment": None, "line": None, "spoken": "I can't find that moment in memory."}
    assert ask(seeded, "Rewind the zebra parade")["grounded"] is False


# ---------- MEM-4: edit and delete a card ----------
def test_edit_and_delete_a_contact_card(seeded):
    p = validate(seeded.patch("/people/per_sam", json={"company": "Globex Labs", "notes": "Met at the career fair"}),
                 "/people/{id}", "patch", 200)
    assert p["company"] == "Globex Labs" and p["notes"] == "Met at the career fair" and p["name"] == "Sam Rivera"
    assert "person.updated" in [e["type"] for e in events.history]
    validate(seeded.patch("/people/per_nobody", json={"notes": "x"}), "/people/{id}", "patch", 404)

    rcp = validate(seeded.delete("/people/per_sam"), "/people/{id}", "delete", 200)
    assert rcp["kind"] == "deletion" and "Sam Rivera" in rcp["summary"]
    assert "per_sam" not in {x["id"] for x in seeded.get("/people").json()["items"]}
    assert not [x for x in seeded.get("/promises").json()["items"] if x["person_id"] == "per_sam"]
    assert all("per_sam" not in m["person_ids"] for m in seeded.get("/moments?limit=200").json()["items"])
    assert seeded.get("/moments/mom_seed_001").status_code == 200  # the moment itself stays
    validate(seeded.delete("/people/per_sam"), "/people/{id}", "delete", 404)
