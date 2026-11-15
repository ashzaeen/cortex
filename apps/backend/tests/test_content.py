"""Content features (#54): recap picks the session by kind, generate has quality gates, look is mode-aware, the caregiver
note stays counts-only. Offline, with stand-in model answers where the real one would write the wording."""
import base64
from datetime import timedelta

from actions import generate
from core import content
from core.errors import ApiError
from core.timeutil import iso, now
from tests.contract_check import validate

JPEG = base64.b64encode(b"\xff\xd8\xff fake").decode()


def post(c, transcript, mode=None, ts=None):
    body = {"ts": ts or iso(now()), "source": "glasses", "transcript": transcript, **({"mode": mode} if mode else {})}
    return validate(c.post("/moments", json=body), "/moments", "post", 201)


# ---------- recap ----------
def test_recap_picks_the_session_by_kind(client):
    t0 = now() - timedelta(hours=3)
    post(client, "Today is software testing. Unit tests check one function.", "student", iso(t0))
    post(client, "Exam two is Thursday.", "student", iso(t0 + timedelta(minutes=5)))
    post(client, "We decided to ship the beta on Friday.", "focus", iso(now() - timedelta(minutes=10)))
    meeting = validate(client.get("/recap", params={"kind": "meeting"}), "/recap", "get", 200)
    lecture = validate(client.get("/recap", params={"kind": "lecture"}), "/recap", "get", 200)
    assert meeting["moment_count"] == 1 and "ship the beta" in meeting["notes"][0]["text"]  # the lecture is not the meeting
    assert lecture["moment_count"] == 2 and "software testing" in lecture["notes"][0]["text"]


def test_recap_does_not_repeat_what_was_already_extracted(client, monkeypatch):
    post(client, "We decided to ship the beta on Friday.", None, iso(now() - timedelta(minutes=10)))
    m = client.get("/moments").json()["items"][0]
    monkeypatch.setattr(content, "run", lambda name, image=None, **kw: {
        "title": "Beta plan", "spoken": "Ship Friday.", "bullets": ["Ship Friday"],
        "decisions": [{"text": "Team decided to ship the beta Friday.", "moment_id": m["id"]}], "follow_ups": []})
    r = validate(client.get("/recap"), "/recap", "get", 200)
    assert r["title"] == "Beta plan" and len(r["decisions"]) == 1  # the tagged one only, not the model's restatement


# ---------- generate ----------
def test_flashcards_are_validated_one_pair_per_line(client, monkeypatch):
    m = post(client, "Mitosis has four phases.")
    monkeypatch.setattr(content, "run", lambda name, image=None, **kw: {"title": "Mitosis", "cards": [
        {"q": "What are the four phases of mitosis?", "a": "Prophase, metaphase, anaphase, telophase"},
        {"q": "What are the four phases of mitosis?", "a": "duplicate"},  # duplicate question: dropped
        {"q": "What was the context of the discussion?", "a": "vague"},  # vague: dropped
        {"q": "Why?", "a": "too short"}]})  # too short: dropped
    a = validate(client.post("/actions/generate", json={"type": "flashcards", "moment_id": m["id"]}),
                 "/actions/generate", "post", 201)
    assert a["doc"]["body"] == "Q: What are the four phases of mitosis? / A: Prophase, metaphase, anaphase, telophase"


def test_thin_moments_are_refused_with_a_clear_message(client, monkeypatch):
    m = post(client, "My charger is in the backpack.")
    monkeypatch.setattr(content, "run", lambda name, image=None, **kw: {"title": "x", "cards": [], "points": []})
    r = validate(client.post("/actions/generate", json={"type": "flashcards", "moment_id": m["id"]}), "/actions/generate", "post", 400)
    assert r["error"]["code"] == "not_enough_content" and "slide" in r["error"]["message"]
    n = validate(client.post("/actions/generate", json={"type": "notes", "moment_id": m["id"]}), "/actions/generate", "post", 400)
    assert n["error"]["code"] == "nothing_found"


def test_notes_have_a_heading_points_terms_and_dates():
    title, body = generate.notes({"title": "Testing", "heading": "Software testing", "points": ["Unit tests check one function"],
                                  "terms": ["mock", "fixture"], "dates": ["Exam Thursday"]})
    assert title == "Testing" and body.splitlines() == ["Software testing", "- Unit tests check one function",
                                                        "Terms: mock, fixture", "Dates: Exam Thursday"]
    try:
        generate.notes({"points": []})
        raise AssertionError("expected a refusal")
    except ApiError as e:
        assert e.code == "nothing_found"


def test_read_aloud_reads_only_what_was_said(client):
    m = post(client, "The quiz is on Thursday at nine.")
    a = validate(client.post("/actions/generate", json={"type": "read_aloud", "moment_id": m["id"]}), "/actions/generate", "post", 201)
    assert a["summary"] == "The quiz is on Thursday at nine."  # no clock, no "I heard"


# ---------- look ----------
def test_look_with_a_picture_uses_the_mode_aware_prompt_and_falls_back_offline(client, monkeypatch):
    client.post("/modes/assist/activate")
    seen = {}

    def fake(name, image=None, **kw):
        seen.update(name=name, detail=kw["detail"], task=kw["task"])
        return {"spoken": "A door ahead, left.", "text": "A door ahead, left.", "found": True}

    monkeypatch.setattr(content, "run", fake)
    r = validate(client.post("/look", json={"task": "hazards", "target": "the door", "snapshot_base64": JPEG}), "/look", "post", 200)
    assert r["spoken"] == "A door ahead, left." and seen["name"] == "look" and seen["task"] == "hazards"
    assert "obstacles, steps, doors" in seen["detail"] and "never say it is safe" in seen["detail"].lower()
    monkeypatch.undo()  # offline: no model answer, so the older path answers and nothing breaks
    assert validate(client.post("/look", json={"task": "describe", "snapshot_base64": JPEG}), "/look", "post", 200)["spoken"]


# ---------- caregiver ----------
def test_caregiver_note_is_added_only_from_counts_and_titles(client, monkeypatch):
    client.post("/routines", json={"title": "Take the evening medicine", "time": "20:00", "days": []})
    asked = {}

    def fake(name, image=None, **kw):
        asked.update(name=name, facts=kw["facts"])
        return {"summary": "A calm day, and the evening medicine reminder is set for eight."}

    monkeypatch.setattr(content, "run", fake)
    cg = validate(client.get("/caregiver"), "/caregiver", "get", 200)
    body = cg["preview"]["body"]
    assert "A calm day" in body and "Routine: Take the evening medicine at 20:00" in body
    assert asked["name"] == "caregiver" and "Moments captured today: 0" in asked["facts"]
    assert "transcript" not in asked["facts"].lower() and "photo" not in asked["facts"].lower()
    monkeypatch.setattr(content, "run", lambda name, image=None, **kw: {})  # no note: the plain summary still works
    assert "Routine: Take the evening medicine" in validate(client.get("/caregiver"), "/caregiver", "get", 200)["preview"]["body"]


# ---------- the real prompts must render ----------
def test_every_real_prompt_renders_and_look_rules_cover_every_task():
    """content.run renders the real prompt even offline, so the skills' own call sites are checked by the tests above;
    this adds a dummy render of every prompt and every look task."""
    import string

    from core import content_prompts as cp

    for name, text in cp.PROMPTS.items():
        slots = {f for _, f, _, _ in string.Formatter().parse(text) if f}
        assert text.format(**dict.fromkeys(slots, "x")), name
    for task in cp.LOOK_RULES:
        assert cp.look_detail(task, "assist", "the door", "how do I solve this?")
