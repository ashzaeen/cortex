"""Gaps left after the skills on main (#50, #51): "Got the deck from Ash", met-again events (#43), brief pre-warm
(BRF-4), the hardcoded follow-up recipient and the smtp default. Contact search is kept as a regression check.
Offline, contract-validated."""
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


def test_got_the_deck_closes_the_promise_with_or_without_i(seeded):
    _, pm = meet_ash(seeded)
    pid = confirm_deck(seeded, pm)
    done = ask(seeded, "Got the deck from Ash")  # main's matcher used to need "I got ..."
    assert done["grounded"] and done["answer"].startswith("Marked done") and "deck" in done["answer"].lower()
    assert [i["id"] for i in seeded.get("/promises", params={"status": "done"}).json()["items"]] == [pid]
    assert not seeded.get("/people/per_ash/brief").json()["open_promises"]  # and the brief stops listing it


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


def test_resend_request_has_a_user_agent_and_the_key(monkeypatch):
    """Resend rejects urllib's default User-Agent with 403 error 1010, so the request must name itself."""
    import urllib.request

    from actions import email
    from core.config import settings

    seen = {}

    class Resp:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=0):
        seen["url"], seen["headers"], seen["body"] = req.full_url, dict(req.header_items()), req.data
        return Resp()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(settings, "email_dry_run", False)
    monkeypatch.setattr(settings, "email_provider", "resend")
    monkeypatch.setattr(settings, "email_from", "onboarding@resend.dev")
    monkeypatch.setattr(settings, "email_api_key", "re_test")
    email.send("someone@example.com", "Subject", "Body")
    assert seen["url"] == "https://api.resend.com/emails"
    assert seen["headers"]["User-agent"] == "cortex-backend/1.0" and seen["headers"]["Authorization"] == "Bearer re_test"
    assert b"someone@example.com" in seen["body"]
