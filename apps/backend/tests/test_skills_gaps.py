"""Skills that were thin: contact search (NET-5), close-out by words (WAI-7), overdue on request (WAI-5),
met-again events (#43), brief pre-warm (BRF-4) and the hardcoded follow-up recipient. Offline, contract-validated."""
import time

from skills import brief
from tests.contract_check import validate
from tests.test_done_when import event_types, meet_ash, post_moment


def ask(c, q):
    return validate(c.post("/ask", json={"question": q, "channel": "voice"}), "/ask", "post", 200)


def confirm_deck(c, pm):
    p = next(i for i in c.get("/promises", params={"status": "proposed"}).json()["items"] if i["source_moment_id"] == pm["id"])
    c.post(f"/promises/{p['id']}/confirm")
    return p["id"]


def test_contact_search_by_company_and_topic(seeded):
    ans = ask(seeded, "Who did I meet from Globex?")
    assert ans["grounded"] and "Sam Rivera from Globex" in ans["answer"] and ans["sources"]
    ml = ask(seeded, "Who did I meet who works on ML?")  # seeded topics: Sam has "ML infra", Dana does not
    assert ml["grounded"] and "Sam Rivera" in ml["answer"] and "Dana" not in ml["answer"]
    sam = next(p for p in seeded.get("/people").json()["items"] if p["id"] == "per_sam")
    assert ml["sources"][0]["id"] == sam["introduced_moment_id"]
    assert "Dana Kim" in ask(seeded, "Who do I know that works on edge devices?")["answer"]
    assert ask(seeded, "Who did I meet who works on quantum?")["grounded"] is False


def test_got_it_closes_the_promise(seeded):
    _, pm = meet_ash(seeded)
    pid = confirm_deck(seeded, pm)
    assert ask(seeded, "What is open with Ash?")["grounded"]
    done = ask(seeded, "Got the deck from Ash")
    assert done["grounded"] and done["answer"].startswith("Marked done: Ash promised") and "deck" in done["answer"].lower()
    items = seeded.get("/promises", params={"status": "done"}).json()["items"]
    assert [i["id"] for i in items] == [pid]
    # Gone from the open lists and from the brief
    assert not seeded.get("/people/per_ash/brief").json()["open_promises"]
    # A question that merely mentions sending is not a command
    assert ask(seeded, "What did Ash send me?")["answer"] != done["answer"]


def test_close_asks_which_when_unsure(seeded):
    intro, pm = meet_ash(seeded)
    seeded.post("/promises", json={"direction": "waiting_on", "person_id": "per_ash", "what": "Send the budget",
                                   "source_moment_id": pm["id"], "due_text": "Monday"})
    vague = ask(seeded, "Mark Ash's promise done")
    assert vague["grounded"] and "2 open items" in vague["answer"]
    assert not seeded.get("/promises", params={"status": "done"}).json()["items"]
    one = ask(seeded, "Got the budget from Ash")
    assert one["answer"].startswith("Marked done") and "budget" in one["answer"].lower()
    left = [p["what"] for p in seeded.get("/promises").json()["items"] if p["person_id"] == "per_ash" and p["status"] != "done"]
    assert len(left) == 1 and "deck" in left[0].lower()


def test_overdue_on_request(seeded):
    late = ask(seeded, "What is overdue?")  # seeded: Sam's internship link was due 2026-11-11
    assert late["grounded"] and "(overdue)" in late["answer"] and "internship" in late["answer"].lower()
    assert late["sources"] and late["spoken"].endswith(".")
    from core import db

    db.col("promises").update_many({}, {"$set": {"status": "done"}})
    assert ask(seeded, "What is overdue?")["answer"] == "Nothing is overdue."


def test_meeting_a_known_person_again_emits_person_updated(seeded):
    post_moment(seeded, "This is Sam from Globex.")
    types = event_types()
    assert "person.updated" in types and "person.created" not in types
    assert len([p for p in seeded.get("/people").json()["items"] if p["name"] == "Sam Rivera"]) == 1


def test_brief_is_warm_after_capture_and_after_confirm(seeded):
    brief.clear_cache()
    _, pm = meet_ash(seeded)
    assert "per_ash" in brief._cache
    before = brief._cache["per_ash"][0]
    confirm_deck(seeded, pm)
    assert brief._cache["per_ash"][0] != before  # statuses changed, so it was rebuilt, not left stale


def test_followup_goes_to_the_hardcoded_recipient(seeded, monkeypatch):
    from actions import email
    from core.config import settings

    sent = []
    monkeypatch.setattr(settings, "followup_email_to", "demo-inbox@example.com")
    monkeypatch.setattr(email, "can_send", lambda: True)
    monkeypatch.setattr(email, "send", lambda to, subject, body: sent.append(to))
    monkeypatch.setattr(settings, "undo_seconds", 1)
    meet_ash(seeded)
    act = validate(seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}),
                   "/actions/propose", "post", 201)
    assert act["draft"]["to"] == "demo-inbox@example.com"
    seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send"})
    time.sleep(1.5)
    assert sent == ["demo-inbox@example.com"]


def test_default_email_provider_is_smtp(monkeypatch):
    from core import config

    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)
    assert config.Settings().email_provider == "smtp"
