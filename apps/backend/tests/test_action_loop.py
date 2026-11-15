"""ACT-11 dismiss, retry from failed (ACT-3), and a held send that a restart left without its timer
(ACT-2, ACT-9, ACT-12). Offline: email, Google and Chert are stubbed; responses are checked against the contract."""
from datetime import timedelta

from actions import chert, doers, email, followup, google
from core import db
from core.timeutil import now
from tests.contract_check import validate
from tests.test_done_when import meet_ash

SRC = ["mom_seed_006"]


def reminder(c):
    return validate(c.post("/actions/propose", json={"type": "reminder", "title": "Chase Sam", "source_moment_ids": SRC}),
                    "/actions/propose", "post", 201)


def test_dismiss_skips_with_a_receipt_and_cannot_be_confirmed(seeded):
    act = reminder(seeded)
    res = validate(seeded.post(f"/actions/{act['id']}/dismiss"), "/actions/{id}/dismiss", "post", 200)
    assert res["action"]["status"] == "dismissed"
    assert res["receipt"]["undo"]["available"] is False and "Skipped" in res["receipt"]["summary"]
    assert res["receipt"]["source_moment_ids"] == SRC
    assert seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"}).status_code == 409
    assert seeded.post(f"/actions/{act['id']}/dismiss").status_code == 409
    listed = validate(seeded.get("/actions?status=dismissed"), "/actions", "get", 200)["items"]
    assert [a["id"] for a in listed] == [act["id"]]
    assert seeded.post("/actions/act_nope/dismiss").status_code == 404


def test_a_done_action_cannot_be_dismissed(seeded):
    act = reminder(seeded)
    seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"})
    assert seeded.post(f"/actions/{act['id']}/dismiss").status_code == 409


def test_failed_action_can_be_retried(seeded, monkeypatch):
    monkeypatch.setattr(google, "resolve_token", lambda t: "tok")
    boom = {"on": True}

    def create(token, task):
        if boom["on"]:
            raise google.GoogleError("Google returned 503")
        return {"provider": "google_tasks", "id": "t1", "url": None}

    monkeypatch.setattr(google, "create_task", create)
    act = reminder(seeded)
    failed = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"}), "/actions/{id}/confirm", "post", 200)
    assert failed["action"]["status"] == "failed"
    boom["on"] = False
    ok = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"}), "/actions/{id}/confirm", "post", 200)
    assert ok["action"]["status"] == "done" and ok["action"]["external"]["id"] == "t1"
    assert "error" not in db.col("actions").find_one({"_id": act["id"]})


def _lose_the_timer(action_id, store):
    t = store.pop(action_id, None)
    if t:
        t.cancel()  # what a restart does: the held send is still `sent`, its timer is gone


def test_sweep_sends_a_held_email_after_its_window(seeded, monkeypatch):
    sent = []
    monkeypatch.setattr(email, "can_send", lambda: True)
    monkeypatch.setattr(email, "send", lambda to, subject, body: sent.append(to))
    meet_ash(seeded)
    act = validate(seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}),
                   "/actions/propose", "post", 201)
    seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send", "draft": {"to": "ash@example.test"}})
    _lose_the_timer(act["id"], followup._timers)
    assert followup.sweep_held() == 0 and not sent  # still inside the undo window: leave it for undo
    db.col("receipts").update_many({"action_id": act["id"]}, {"$set": {"undo.until": now() - timedelta(seconds=1)}})
    assert followup.sweep_held() == 1 and sent == ["ash@example.test"]
    assert followup.sweep_held() == 0 and len(sent) == 1  # delivered once only
    assert next(a for a in seeded.get("/actions").json()["items"] if a["id"] == act["id"])["status"] == "sent"


def test_sweep_skips_an_undone_send(seeded, monkeypatch):
    sent = []
    monkeypatch.setattr(email, "can_send", lambda: True)
    monkeypatch.setattr(email, "send", lambda to, subject, body: sent.append(to))
    meet_ash(seeded)
    act = validate(seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}),
                   "/actions/propose", "post", 201)
    seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send", "draft": {"to": "ash@example.test"}})
    seeded.post(f"/actions/{act['id']}/undo")
    db.col("receipts").update_many({"action_id": act["id"]}, {"$set": {"undo.until": now() - timedelta(seconds=1)}})
    assert followup.sweep_held() == 0 and not sent


def test_sweep_sends_a_held_text(seeded, monkeypatch):
    sent = []
    monkeypatch.setattr(chert, "can_send", lambda: True)
    monkeypatch.setattr(chert, "send", lambda to, text, key: sent.append(to) or "msg_9")
    act = validate(seeded.post("/actions/propose", json={"type": "message", "source_moment_ids": SRC,
                                                         "message": {"to": "+15555550123", "text": "Hi"}}),
                   "/actions/propose", "post", 201)
    seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send"})
    _lose_the_timer(act["id"], doers._timers)
    db.col("receipts").update_many({"action_id": act["id"]}, {"$set": {"undo.until": now() - timedelta(seconds=1)}})
    assert followup.sweep_held() == 1 and sent == ["+15555550123"]
    assert db.col("actions").find_one({"_id": act["id"]})["external"]["id"] == "msg_9"


def test_edits_apply_before_the_action_runs(seeded, monkeypatch):
    seen = {}
    monkeypatch.setattr(google, "resolve_token", lambda t: "tok")
    monkeypatch.setattr(google, "create_event",
                        lambda tok, ev: seen.update(ev=ev) or {"provider": "google_calendar", "id": "e1", "url": None})
    act = validate(seeded.post("/actions/propose", json={
        "type": "calendar_event", "title": "Demo", "source_moment_ids": SRC,
        "event": {"title": "Demo", "start": "2026-11-19T10:00:00-06:00", "end": "2026-11-19T11:00:00-06:00"}}),
        "/actions/propose", "post", 201)
    bad = seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do", "event": {"end": "2026-11-19T09:00:00-06:00"}})
    assert bad.status_code == 400 and db.col("actions").find_one({"_id": act["id"]})["status"] == "proposed"
    edit = {"title": "Demo with Ash", "start": "2026-11-19T15:00:00-06:00", "end": "2026-11-19T16:00:00-06:00",
            "location": "ERB 129"}
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do", "event": edit}),
                   "/actions/{id}/confirm", "post", 200)
    assert res["action"]["title"] == "Demo with Ash" and res["action"]["event"]["location"] == "ERB 129"
    assert seen["ev"]["start"].startswith("2026-11-19T15:00") and seen["ev"]["title"] == "Demo with Ash"


def test_text_edit_needs_a_real_number(seeded):
    act = validate(seeded.post("/actions/propose", json={"type": "message", "source_moment_ids": SRC,
                                                         "message": {"to": "+15555550123", "text": "Hi"}}),
                   "/actions/propose", "post", 201)
    url = f"/actions/{act['id']}/confirm"
    assert seeded.post(url, json={"deliver": "send", "message": {"to": "555"}}).status_code == 400
    ok = validate(seeded.post(url, json={"deliver": "send", "message": {"text": "Hi Ash, running late"}}),
                  "/actions/{id}/confirm", "post", 200)
    assert ok["action"]["message"]["text"] == "Hi Ash, running late"
