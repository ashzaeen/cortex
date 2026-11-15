"""ACT-9: a person's phone, a text proposed from their card or by voice, and the same hold-then-send and undo as
any message. Offline: Chert is stubbed; every response is checked against the contract."""
from actions import chert
from core import db
from core.config import settings
from tests.contract_check import validate
from tests.test_done_when import meet_ash

PHONE = "+15555550123"


def ash(c):
    meet_ash(c)
    return "per_ash"


def set_phone(c, pid, phone, status=200):
    r = c.patch(f"/people/{pid}", json={"phone": phone})
    assert r.status_code == status, r.text
    return r


def say(c, q):
    return validate(c.post("/ask", json={"question": q, "channel": "voice"}), "/ask", "post", 200)


def test_a_phone_is_saved_validated_cleared_and_stays_private_to_the_card(seeded):
    pid = ash(seeded)
    p = validate(set_phone(seeded, pid, "+1 555 555 0123"), "/people/{id}", "patch", 200)
    assert p["phone"] == PHONE
    for bad in ("555-0123", "+0123456", "call me"):
        assert "+15555550123" in set_phone(seeded, pid, bad, 400).text
    cleared = validate(set_phone(seeded, pid, ""), "/people/{id}", "patch", 200)
    assert "phone" not in cleared
    assert "phone" not in next(x for x in validate(seeded.get("/people"), "/people", "get", 200)["items"] if x["id"] == pid)


def test_proposing_a_text_needs_a_number_and_drafts_from_the_open_promise(seeded):
    pid = ash(seeded)
    r = seeded.post("/actions/propose", json={"type": "message", "person_id": pid})
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_phone" and "Ash" in r.json()["error"]["message"]
    set_phone(seeded, pid, PHONE)
    act = validate(seeded.post("/actions/propose", json={"type": "message", "person_id": pid}), "/actions/propose", "post", 201)
    assert act["status"] == "proposed" and act["message"]["to"] == PHONE and act["person_id"] == pid
    assert act["title"] == "Text Ash" and "deck" in act["message"]["text"].lower() and act["message"]["text"] in act["summary"]
    assert act["source_moment_ids"]
    again = validate(seeded.post("/actions/propose", json={"type": "message", "person_id": pid}), "/actions/propose", "post", 201)
    assert again["id"] == act["id"]  # one waiting text per person


def test_the_text_is_held_then_sent_and_undo_cancels_it(seeded, monkeypatch):
    pid = ash(seeded)
    set_phone(seeded, pid, PHONE)
    sent = []
    monkeypatch.setattr(chert, "can_send", lambda: True)
    monkeypatch.setattr(chert, "send", lambda to, text, key: sent.append((to, text)) or "msg_1")
    act = validate(seeded.post("/actions/propose", json={"type": "message", "person_id": pid}), "/actions/propose", "post", 201)
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send", "message": {"text": "On my way, Ash"}}),
                   "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "sent" and not sent and res["receipt"]["undo"]["available"]
    undone = validate(seeded.post(f"/actions/{act['id']}/undo"), "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone" and not sent
    settings.undo_seconds = 0.05
    act2 = validate(seeded.post("/actions/propose", json={"type": "message", "person_id": pid}), "/actions/propose", "post", 201)
    seeded.post(f"/actions/{act2['id']}/confirm", json={"deliver": "send"})
    from actions import doers

    doers._timers[act2["id"]].join(2)
    assert sent == [(PHONE, db.col("actions").find_one({"_id": act2["id"]})["message"]["text"])]


def test_voice_text_command_proposes_and_yes_sends(seeded):
    pid = ash(seeded)
    out = say(seeded, "Text Ash I'm running late")
    assert "don't have a number for Ash" in out["spoken"]
    set_phone(seeded, pid, PHONE)
    out = say(seeded, "Text Ash I'm running late")
    assert out["spoken"].startswith("Text to Ash: I'm running late") and "yes" in out["spoken"]
    msgs = [a for a in validate(seeded.get("/actions", params={"status": "proposed"}), "/actions", "get", 200)["items"]
            if a["type"] == "message"]
    assert len(msgs) == 1 and msgs[0]["message"] == {"to": PHONE, "text": "I'm running late"}
    done = say(seeded, "yes")
    assert "draft" in done["spoken"].lower()  # texting is off in tests, so approval saves a draft
    out = say(seeded, "message Ash that the deck is ready")
    assert out["spoken"].startswith("Text to Ash: the deck is ready")


def test_voice_text_command_ignores_names_it_does_not_know(seeded):
    ash(seeded)
    assert say(seeded, "Text Zorblax I'm late")["grounded"] is False  # falls through to memory search
    assert not [a for a in seeded.get("/actions").json()["items"] if a["type"] == "message"]


def test_titles_are_skipped_when_naming_someone(seeded):
    from core import db
    from skills import network

    assert network.given_name("Prof. Morgan Lee") == "Morgan" and network.given_name("Ash Kim") == "Ash"
    assert network.given_name("Dr.") == "Dr."
    pid = ash(seeded)
    db.col("people").update_one({"_id": pid}, {"$set": {"name": "Prof. Ash Kim", "name_lower": "prof. ash kim",
                                                        "first_lower": "prof."}})
    set_phone(seeded, pid, PHONE)
    act = validate(seeded.post("/actions/propose", json={"type": "message", "person_id": pid}), "/actions/propose", "post", 201)
    assert act["title"] == "Text Ash" and act["message"]["text"].startswith("Hi Ash,")
    assert say(seeded, "Text Ash I'm here")["spoken"].startswith("Text to Ash: I'm here")
