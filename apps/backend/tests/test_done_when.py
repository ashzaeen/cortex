"""Tier 0 done-when tests (docs/PLAN.md) for the backend: T0-1 to T0-7 and T0-9, following the hero demo.
Offline: mongomock + mock LLM. Every response is validated against the contract."""
import base64
import struct
import time

import pytest

from core import events
from tests.contract_check import validate

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 600 + b"\xff\xd9"
TS = "2026-11-15T14:02:11-06:00"


def mov(seconds: float) -> bytes:
    timescale = 1_000
    duration = int(seconds * timescale)
    ftyp = struct.pack(">I4s4sI", 16, b"ftyp", b"qt  ", 0)
    mvhd_payload = b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, timescale, duration) + b"\x00" * 16
    return ftyp + struct.pack(">I4s", len(mvhd_payload) + 8, b"mvhd") + mvhd_payload


def post_moment(c, transcript=None, snapshot=None, source="glasses", status=201):
    body = {"ts": TS, "source": source, "transcript": transcript,
            "snapshot_base64": base64.b64encode(snapshot).decode() if snapshot else None}
    return validate(c.post("/moments", json=body), "/moments", "post", status)


def event_types():
    return [e["type"] for e in events.history]


def meet_ash(c):
    intro = post_moment(c, "This is Ash from Acme.", JPEG)
    promise_m = post_moment(c, "I'll send you the deck Friday.")
    return intro, promise_m


def test_t0_1_capture_stores_moment_quickly(client):
    t0 = time.perf_counter()
    m = post_moment(client, "These are my headphones on the desk.", JPEG)
    assert time.perf_counter() - t0 < 3
    assert m["transcript"].startswith("These are") and m["snapshot_url"].startswith("http://testserver/snapshots/")
    assert client.get(m["snapshot_url"].replace("http://testserver", "")).content == JPEG
    assert "moment.created" in event_types()
    assert validate(client.get("/moments"), "/moments", "get", 200)["items"][0]["id"] == m["id"]


def test_t0_1_image_only_capture_creates_gemini_insight_and_event(client):
    moment = post_moment(client, snapshot=JPEG)

    assert moment["source"] == "glasses"
    assert moment["caption"] == "A scene from the wearer's point of view."
    assert moment["snapshot_url"].startswith("http://testserver/snapshots/")
    assert events.history[-1]["type"] == "moment.created"
    assert events.history[-1]["data"]["id"] == moment["id"]


def test_t0_1_short_video_creates_insight_file_and_event(client):
    clip = mov(10)
    response = client.post("/moments", json={
        "ts": TS,
        "source": "glasses",
        "video_base64": base64.b64encode(clip).decode(),
    })
    moment = validate(response, "/moments", "post", 201)

    assert moment["caption"] == "A short video from the wearer's point of view."
    assert moment["video_url"].startswith("http://testserver/videos/")
    assert client.get(moment["video_url"].replace("http://testserver", "")).content == clip
    assert events.history[-1]["type"] == "moment.created"
    assert events.history[-1]["data"]["video_url"] == moment["video_url"]
    validate(client.delete(f"/moments/{moment['id']}"), "/moments/{id}", "delete", 200)
    assert client.get(moment["video_url"].replace("http://testserver", "")).status_code == 404


def test_t0_1_video_over_ten_seconds_is_rejected(client):
    response = client.post("/moments", json={
        "ts": TS,
        "source": "glasses",
        "video_base64": base64.b64encode(mov(10.5)).decode(),
    })

    error = validate(response, "/moments", "post", 400)
    assert error["error"]["code"] == "video_too_long"


@pytest.mark.parametrize("question,expected", [
    ("Where did I leave my keys?", "mom_seed_003"),
    ("What did Sam promise me?", "mom_seed_002"),
    ("When are the CSE 3310 demos?", "mom_seed_006"),
    ("What do I owe Dana?", "mom_seed_005"),
])
def test_t0_2_search_returns_right_source_moment_every_time(seeded, question, expected):
    for _ in range(3):
        res = validate(seeded.get("/moments/search", params={"q": question}), "/moments/search", "get", 200)
        assert res["results"][0]["moment"]["id"] == expected


def test_t0_2_fresh_moment_is_searchable_immediately(seeded):
    m = post_moment(seeded, "The router password is on a sticky note under the monitor.")
    res = validate(seeded.get("/moments/search", params={"q": "router password"}), "/moments/search", "get", 200)
    assert res["results"][0]["moment"]["id"] == m["id"]


def test_t0_3_introduction_creates_card_with_moment(seeded):
    intro = post_moment(seeded, "This is Ash from Acme.", JPEG)
    people = validate(seeded.get("/people"), "/people", "get", 200)["items"]
    ash = next(p for p in people if p["name"] == "Ash")
    assert ash["company"] == "Acme" and ash["introduced_moment_id"] == intro["id"] and ash["consent"] == "introduction"
    assert intro["person_ids"] == [ash["id"]]
    assert "person.created" in event_types()
    # Hand correction keeps one card
    fixed = validate(seeded.post("/people", json={"name": "Ashe", "company": "Acme", "introduced_moment_id": intro["id"]}),
                     "/people", "post", 201)
    assert fixed["id"] == ash["id"] and fixed["name"] == "Ashe"


def test_t0_4_spoken_promise_becomes_tracked_item(seeded):
    intro, pm = meet_ash(seeded)
    items = validate(seeded.get("/promises", params={"status": "proposed"}), "/promises", "get", 200)["items"]
    p = next(i for i in items if i["source_moment_id"] == pm["id"])
    assert p["direction"] == "waiting_on" and p["person_id"] == "per_ash" and "deck" in p["what"].lower()
    assert p["due"]["text"] == "Friday" and p["due"]["date"] and p["due"]["inferred"] is False
    assert pm["person_ids"] == ["per_ash"]
    confirmed = validate(seeded.post(f"/promises/{p['id']}/confirm"), "/promises/{id}/confirm", "post", 200)
    assert confirmed["status"] == "confirmed"
    assert {"promise.proposed", "promise.confirmed", "action.proposed"} <= set(event_types())
    waiting = validate(seeded.get("/promises", params={"direction": "waiting_on", "person_id": "per_ash"}),
                       "/promises", "get", 200)["items"]
    assert [w["id"] for w in waiting] == [p["id"]]


def test_t0_5_ask_with_proof_receipt(seeded):
    _, pm = meet_ash(seeded)
    ans = validate(seeded.post("/ask", json={"question": "What did Ash promise me?", "channel": "voice"}), "/ask", "post", 200)
    assert ans["grounded"] and "deck" in ans["spoken"].lower() and pm["id"] in [s["id"] for s in ans["sources"]]
    rcp = next(r for r in validate(seeded.get("/receipts"), "/receipts", "get", 200)["items"] if r["id"] == ans["receipt_id"])
    assert rcp["kind"] == "answer" and pm["id"] in rcp["source_moment_ids"]
    keys = validate(seeded.post("/ask", json={"question": "Where did I leave my keys?", "channel": "dashboard"}),
                    "/ask", "post", 200)
    assert keys["grounded"] and keys["sources"][0]["id"] == "mom_seed_003"
    nothing = validate(seeded.post("/ask", json={"question": "What is the capital of Mars?", "channel": "voice"}),
                       "/ask", "post", 200)
    assert nothing["grounded"] is False and nothing["sources"] == []
    finale = validate(seeded.post("/ask", json={"question": "What is open with Ash?", "channel": "call"}), "/ask", "post", 200)
    assert finale["grounded"] and "deck" in finale["answer"].lower()


def test_t0_6_brief(seeded):
    intro, pm = meet_ash(seeded)
    b = validate(seeded.get("/people/per_ash/brief"), "/people/{id}/brief", "get", 200)
    assert b["spoken"].startswith("Ash") and "deck" in b["spoken"].lower() and len(b["bullets"]) <= 3
    assert len(b["spoken"].split()) <= 70  # about 20 seconds
    assert [p["source_moment_id"] for p in b["open_promises"]] == [pm["id"]]
    assert {intro["id"], pm["id"]} <= {s["id"] for s in b["sources"]}
    voice = validate(seeded.post("/ask", json={"question": "Brief me on Ash", "channel": "voice"}), "/ask", "post", 200)
    assert voice["grounded"] and voice["spoken"] == b["spoken"]


def test_t0_7_follow_up_email_propose_confirm_undo(seeded):
    meet_ash(seeded)
    act = validate(seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}),
                   "/actions/propose", "post", 201)
    assert act["status"] == "proposed" and act["draft"]["to"] == "ash@acme.example"
    again = validate(seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}),
                     "/actions/propose", "post", 201)
    assert again["id"] == act["id"]  # no duplicate proposals
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send", "draft": {"subject": "Hi Ash"}}),
                   "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "draft_saved"  # EMAIL_DRY_RUN=true saves a draft instead of sending
    assert res["action"]["draft"]["subject"] == "Hi Ash" and res["receipt"]["undo"]["available"] is True
    undone = validate(seeded.post(f"/actions/{act['id']}/undo"), "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone" and undone["receipt"]["undo"]["available"] is False
    validate(seeded.post(f"/actions/{act['id']}/undo"), "/actions/{id}/undo", "post", 409)
    validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "draft"}), "/actions/{id}/confirm", "post", 409)


def test_t0_7_real_send_waits_for_undo_window(seeded, monkeypatch):
    from actions import email
    from core.config import settings

    sent = []
    monkeypatch.setattr(email, "can_send", lambda: True)
    monkeypatch.setattr(email, "send", lambda to, subject, body: sent.append(to))
    monkeypatch.setattr(settings, "undo_seconds", 1)
    meet_ash(seeded)
    act = seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_ash"}).json()
    res = validate(seeded.post(f"/actions/{act['id']}/confirm", json={"deliver": "send"}), "/actions/{id}/confirm", "post", 200)
    assert res["action"]["status"] == "sent" and sent == []
    time.sleep(1.5)
    assert sent == ["ash@acme.example"]

    # Undo inside the window cancels delivery
    seeded.post("/moments", json={"ts": TS, "source": "glasses", "transcript": "This is Bo from Initrode."})
    bo = seeded.post("/actions/propose", json={"type": "follow_up_email", "person_id": "per_bo"}).json()
    seeded.post(f"/actions/{bo['id']}/confirm", json={"deliver": "send"})
    validate(seeded.post(f"/actions/{bo['id']}/undo"), "/actions/{id}/undo", "post", 200)
    time.sleep(1.5)
    assert sent == ["ash@acme.example"]


def test_t0_9_pause_off_record_and_delete_with_derived_data(seeded, tmp_path):
    for state in ("paused", "off_record"):
        st = validate(seeded.post("/privacy/pause", json={"state": state}), "/privacy/pause", "post", 200)
        assert st["state"] == state
        err = post_moment(seeded, "secret plans", status=409)
        assert err["error"]["code"] == state
    validate(seeded.post("/privacy/pause", json={"state": "capturing"}), "/privacy/pause", "post", 200)
    assert "privacy.changed" in event_types()

    intro, pm = meet_ash(seeded)
    snap_file = tmp_path / "snapshots" / intro["snapshot_url"].rsplit("/", 1)[1]
    assert snap_file.exists()
    rcp = validate(seeded.delete(f"/moments/{intro['id']}"), "/moments/{id}", "delete", 200)
    assert rcp["kind"] == "deletion" and "snapshot" in rcp["summary"]
    assert not snap_file.exists()
    assert intro["id"] not in [m["id"] for m in seeded.get("/moments").json()["items"]]
    assert "per_ash" not in [p["id"] for p in seeded.get("/people").json()["items"]]
    assert all(p["person_id"] != "per_ash" for p in seeded.get("/promises").json()["items"])
    hits = seeded.get("/moments/search", params={"q": "Ash from Acme"}).json()["results"]
    assert intro["id"] not in [h["moment"]["id"] for h in hits]
    assert "moment.deleted" in event_types()


# ---- spoken words in a video are kept (the model hears the video's audio)
def _hearing(monkeypatch, said, who=None):
    """Make the mock model report speech for a video, as Gemini does when it hears the clip."""
    from core.llm_mock import MockLLM

    real = MockLLM.perceive

    def perceive(self, **kw):
        out = real(self, **kw)
        out["transcript"] = said
        if who:
            out["people_introduced"] = [{"name": who[0], "company": who[1], "role": None, "confidence": 0.95}]
        return out

    monkeypatch.setattr(MockLLM, "perceive", perceive)


def _video(c, **extra):
    return validate(c.post("/moments", json={"ts": TS, "source": "glasses",
                                              "video_base64": base64.b64encode(mov(8)).decode(), **extra}),
                    "/moments", "post", 201)


def test_video_speech_is_stored_searchable_and_answerable(client, monkeypatch):
    _hearing(monkeypatch, "  This is Ash from Acme.  ", who=("Ash", "Acme"))
    moment = _video(client)
    assert moment["transcript"] == "This is Ash from Acme."
    assert any(m["id"] == moment["id"] and m["transcript"] == "This is Ash from Acme."
               for m in client.get("/moments").json()["items"])
    answer = validate(client.post("/ask", json={"question": "Who did I meet from Acme?", "channel": "voice"}),
                      "/ask", "post", 200)
    assert answer["grounded"] and answer["sources"][0]["id"] == moment["id"]


def test_video_without_speech_keeps_null_transcript(client, monkeypatch):
    for said in (None, "", "null", "None", "No speech.", "(silence)", 42):
        _hearing(monkeypatch, said)
        assert _video(client)["transcript"] is None, said


def test_a_given_transcript_wins_and_stills_never_get_one(client, monkeypatch):
    _hearing(monkeypatch, "The model heard something else.")
    assert _video(client, transcript="I said this.")["transcript"] == "I said this."
    still = post_moment(client, snapshot=JPEG)
    assert still["transcript"] is None
