"""ACT-5 calendar, ACT-6 tasks, ACT-7 Drive notes and flashcards, ACT-9 Chert text, plus #45 (mode
filter, deliver: do). Offline: Google and Chert are stubbed; every response is checked against the contract."""
import pytest

from actions import chert, doers, google
from core.config import settings
from tests.contract_check import validate

SRC = ["mom_seed_006"]
PROPOSALS = {
    "calendar_event": {"title": "CSE 3310 demo", "event": {"title": "CSE 3310 demo", "start": "2026-11-19T10:00:00-06:00",
                                                            "end": "2026-11-19T11:00:00-06:00", "location": "ERB 129"}},
    "reminder": {"title": "Chase Sam for the application link", "task": {"title": "Chase Sam", "due": "2026-11-18"}},
    "flashcards": {"title": "CSE 3310 schedule cards",
                   "doc": {"title": "CSE 3310 cards", "body": "Q: When are demos?\nA: Nov 19"}},
    "notes": {"title": "Lecture notes", "summary": "Demos moved to Nov 19."},
    "read_aloud": {"title": "The whiteboard"},
}


def propose(c, kind, **extra):
    body = {"type": kind, "source_moment_ids": SRC, **PROPOSALS.get(kind, {}), **extra}
    return validate(c.post("/actions/propose", json=body), "/actions/propose", "post", 201)


@pytest.fixture()
def fake_google(monkeypatch):
    calls = []

    def make(provider):
        def create(token, *args):
            calls.append(("create", provider, token))
            return {"provider": provider, "id": f"{provider}_1", "url": f"https://example.test/{provider}"}
        return create

    monkeypatch.setattr(google, "create_event", make("google_calendar"))
    monkeypatch.setattr(google, "create_task", make("google_tasks"))
    monkeypatch.setattr(google, "create_doc", make("google_drive"))
    for name in ("delete_event", "delete_task", "trash_file"):
        monkeypatch.setattr(google, name, lambda token, ext_id, n=name: calls.append((n, ext_id, token)))
    return calls


@pytest.mark.parametrize("kind", ["calendar_event", "reminder", "flashcards", "notes"])
def test_google_action_creates_then_undo_removes(seeded, fake_google, kind):
    act = propose(seeded, kind)
    assert act["status"] == "proposed" and act["mode"] and act["title"]
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"},
                               headers={"X-Google-Access-Token": "tok"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "done" and res["action"]["external"]["id"].endswith("_1")
    assert res["receipt"]["undo"]["available"] and fake_google[0][2] == "tok"
    undone = validate(seeded.post(f"/actions/{act['id']}/undo", headers={"X-Google-Access-Token": "tok"}),
                      "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone" and fake_google[-1][1] == res["action"]["external"]["id"]


def test_google_action_without_token_is_a_dry_run(seeded, fake_google):
    act = propose(seeded, "reminder")
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "done" and res["action"]["external"] is None
    assert "Dry run" in res["receipt"]["summary"] and not fake_google
    validate(seeded.post(f"/actions/{act['id']}/undo"), "/actions/{id}/undo", "post", 200)


def test_google_failure_marks_action_failed(seeded, monkeypatch):
    def boom(*_):
        raise google.GoogleError("Google returned 403: insufficient scope")
    monkeypatch.setattr(google, "create_event", boom)
    act = propose(seeded, "calendar_event")
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "do"},
                               headers={"X-Google-Access-Token": "tok"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "failed" and "403" in res["receipt"]["summary"]


def test_mode_filter_and_deliver_rules(seeded):
    cal = propose(seeded, "calendar_event", mode="student")
    propose(seeded, "read_aloud")
    items = validate(seeded.get("/actions", params={"mode": "student", "status": "proposed"}), "/actions", "get", 200)["items"]
    assert [a["id"] for a in items] == [cal["id"]]
    validate(seeded.post(f"/actions/{cal['id']}/confirm", json={"deliver": "send"}), "/actions/{id}/confirm", "post", 400)
    validate(seeded.post("/actions/propose", json={"type": "calendar_event", "title": "x", "source_moment_ids": SRC}),
             "/actions/propose", "post", 400)
    done = validate(seeded.get("/actions", params={"status": "done"}), "/actions", "get", 200)["items"]
    assert done == []


def test_message_dry_run_saves_a_draft(seeded):
    act = propose(seeded, "message", person_id="per_ash", message={"to": "+15555550123", "text": "Running 5 min late"})
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "draft_saved" and "Dry run" in res["receipt"]["summary"]


def test_message_is_held_for_undo_then_sent(seeded, monkeypatch):
    sent = []
    monkeypatch.setattr(chert, "can_send", lambda: True)
    monkeypatch.setattr(chert, "send", lambda to, text, key: sent.append((to, text)) or "msg_1")
    settings.undo_seconds = 0.05
    act = propose(seeded, "message", message={"to": "+15555550123", "text": "On my way"})
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "sent" and not sent
    doers._timers[act["id"]].join(2)
    assert sent == [("+15555550123", "On my way")]
    final = validate(seeded.get("/actions"), "/actions", "get", 200)["items"]
    assert next(a for a in final if a["id"] == act["id"])["external"] == {"provider": "chert", "id": "msg_1", "url": None}

    settings.undo_seconds = 30
    held = propose(seeded, "message", message={"to": "+15555550123", "text": "Cancel me"})
    seeded.post(f"/actions/{held['id']}/confirm", json={"deliver": "send"})
    undone = validate(seeded.post(f"/actions/{held['id']}/undo"), "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone" and len(sent) == 1
