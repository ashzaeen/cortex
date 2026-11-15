"""ACT-4: a mode may run low-risk suggestions (reminder, notes, flashcards) without asking. Off by default;
email, calendar and texts can never be auto-run; every auto action is receipted, undoable and in the recap."""
from core import db
from tests.contract_check import validate
from tests.test_done_when import post_moment

SAY = "Remind me to buy batteries by Friday."


def actions(c, **q):
    return validate(c.get("/actions", params=q), "/actions", "get", 200)["items"]


def set_auto(c, mode, types, status=200):
    r = c.patch(f"/modes/{mode}", json={"auto_run": types})
    assert r.status_code == status, r.text
    return r.json()


def test_off_by_default_everything_waits(seeded):
    assert validate(seeded.get("/modes"), "/modes", "get", 200)["items"][0]["auto_run"] == []
    post_moment(seeded, SAY)
    rem = [a for a in actions(seeded) if a["type"] == "reminder" and a["title"] == "Buy batteries"]
    assert len(rem) == 1 and rem[0]["status"] == "proposed" and "auto" not in rem[0]


def test_a_mode_can_run_a_reminder_on_its_own_and_undo_works(seeded):
    mode = set_auto(seeded, "focus", ["reminder"])
    assert mode["auto_run"] == ["reminder"]
    post_moment(seeded, SAY)
    rem = next(a for a in actions(seeded) if a["type"] == "reminder" and a["title"] == "Buy batteries")
    assert rem["status"] == "done" and rem["auto"] is True
    rcp = next(r for r in db.col("receipts").find({"action_id": rem["id"]}))
    assert rcp["undo"]["available"] is True and rcp["source_moment_ids"]
    undone = validate(seeded.post(f"/actions/{rem['id']}/undo"), "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone"


def test_calendar_and_email_never_auto_run(seeded):
    for bad in (["calendar_event"], ["follow_up_email"], ["message"], ["reminder", "caregiver_summary"]):
        assert "always needs your yes" in seeded.patch("/modes/focus", json={"auto_run": bad}).text
    set_auto(seeded, "focus", ["reminder"])
    post_moment(seeded, "The project demo is on Thursday at 10:30 am.")
    cal = [a for a in actions(seeded) if a["type"] == "calendar_event"]
    assert cal and all(a["status"] == "proposed" for a in cal)


def test_auto_run_needs_the_type_to_be_allowed(seeded):
    set_auto(seeded, "focus", ["reminder"])
    seeded.patch("/modes/focus", json={"allowed_actions": ["follow_up_email"]})
    post_moment(seeded, SAY)
    assert not [a for a in actions(seeded) if a["type"] == "reminder" and a["title"] == "Buy batteries"]


def test_the_recap_lists_what_ran_without_asking(seeded):
    set_auto(seeded, "focus", ["reminder"])
    post_moment(seeded, SAY)
    r = validate(seeded.get("/recap"), "/recap", "get", 200)
    assert len(r["auto_actions"]) == 1 and "batteries" in r["auto_actions"][0]["text"].lower()


def test_custom_mode_can_set_auto_run(seeded):
    made = validate(seeded.post("/modes", json={"name": "Lab", "allowed_actions": ["notes"], "auto_run": ["notes"]}),
                    "/modes", "post", 201)
    assert made["auto_run"] == ["notes"]
