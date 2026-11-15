"""ACT-1 step 3, VOI-3, VOI-4: spoken yes / save a draft / skip / undo / edit on the pending action, through POST /ask."""
from actions import email
from core import db
from tests.contract_check import validate
from tests.test_done_when import meet_ash

SRC = ["mom_seed_006"]


def say(c, q):
    return validate(c.post("/ask", json={"question": q, "channel": "voice"}), "/ask", "post", 200)


def status(c, aid):
    return next(a for a in c.get("/actions").json()["items"] if a["id"] == aid)["status"]


def propose_email(c):
    meet_ash(c)
    return validate(c.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}),
                    "/actions/propose", "post", 201)


def test_yes_sends_the_pending_email_and_undo_takes_it_back(seeded, monkeypatch):
    monkeypatch.setattr(email, "can_send", lambda: True)
    monkeypatch.setattr(email, "send", lambda *a: None)
    act = propose_email(seeded)
    a = say(seeded, "Yes.")
    assert status(seeded, act["id"]) == "sent" and "undo" in a["spoken"].lower() and a["sources"]
    u = say(seeded, "undo that")
    assert status(seeded, act["id"]) == "undone" and "Undid" in u["spoken"]


def test_a_longer_sentence_never_approves(seeded):
    act = propose_email(seeded)
    say(seeded, "yes the deck is ready on Friday")
    assert status(seeded, act["id"]) == "proposed"


def test_skip_dismisses_and_save_a_draft_saves_one(seeded):
    act = propose_email(seeded)
    a = say(seeded, "save it as a draft")
    assert status(seeded, act["id"]) == "draft_saved" and a["grounded"]
    seeded.post(f"/actions/{act['id']}/undo")
    r = validate(seeded.post("/actions/propose", json={"type": "reminder", "title": "Chase Sam", "source_moment_ids": SRC,
                                                       "mode": "focus"}), "/actions/propose", "post", 201)
    assert "Skipped" in say(seeded, "skip")["spoken"] and status(seeded, r["id"]) == "dismissed"
    assert db.col("actions").find_one({"_id": r["id"]})["status"] == "dismissed"


def test_edit_points_to_the_card_and_changes_nothing(seeded):
    act = propose_email(seeded)
    assert "Edit" in say(seeded, "edit")["spoken"] and status(seeded, act["id"]) == "proposed"


def test_yes_with_nothing_waiting_falls_through(seeded):
    out = say(seeded, "yes")
    assert out["grounded"] is False
    assert "nothing to undo" in say(seeded, "undo")["spoken"].lower()


def test_a_message_needs_the_yes_and_a_caregiver_summary_is_never_voiced(seeded):
    seeded.post("/modes/life/activate")
    m = validate(seeded.post("/actions/propose", json={"type": "message", "source_moment_ids": SRC, "mode": "life",
                                                       "message": {"to": "+15555550123", "text": "On my way"}}),
                 "/actions/propose", "post", 201)
    assert status(seeded, m["id"]) == "proposed"
    a = say(seeded, "go ahead")
    assert status(seeded, m["id"]) == "draft_saved" and "draft" in a["spoken"].lower()


def test_yes_approves_the_newest_suggestion_not_an_older_one_still_waiting(seeded):
    seeded.post("/modes/life/activate")
    def reminder(title):
        body = {"type": "reminder", "title": title, "source_moment_ids": SRC, "mode": "life"}
        return validate(seeded.post("/actions/propose", json=body), "/actions/propose", "post", 201)

    older, newer = reminder("Older reminder"), reminder("Newer reminder")
    say(seeded, "yes")
    assert status(seeded, newer["id"]) == "done" and status(seeded, older["id"]) == "proposed"
    say(seeded, "skip")
    assert status(seeded, older["id"]) == "dismissed"
