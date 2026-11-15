"""Modes (#50): voice switching, suggestions, enforcement, per-mode skills, routines, caregiver, custom modes.
Offline and contract-validated. Focus behavior must not change (the hero demo depends on it)."""
from datetime import timedelta

from core import events, prompts
from core.timeutil import iso, now
from skills import modes, routines
from tests.contract_check import validate

TS = "2026-11-15T14:02:11-06:00"


def post(c, transcript, ts=None, **extra):
    body = {"ts": ts or iso(now()), "source": "glasses", "transcript": transcript, **extra}
    return validate(c.post("/moments", json=body), "/moments", "post", 201)


def ask(c, q):
    return validate(c.post("/ask", json={"question": q, "channel": "voice"}), "/ask", "post", 200)


def mode_list(c):
    return validate(c.get("/modes"), "/modes", "get", 200)


def active(c):
    return next(m["id"] for m in mode_list(c)["items"] if m["active"])


def types():
    return [e["type"] for e in events.history]


# ---------- MODE-1: presets and settings ----------
def test_presets_carry_the_v2_fields(client):
    items = {m["id"]: m for m in mode_list(client)["items"]}
    assert list(items) == ["focus", "student", "life", "assist"]
    assert items["focus"]["active"] and items["assist"]["retention_days"] == 7
    assert "caregiver_summary" in items["assist"]["allowed_actions"]
    assert mode_list(client)["suggestion"] is None


def test_edit_mode_settings(client):
    m = validate(client.patch("/modes/life", json={"auto_suggest": False, "retention_days": 30,
                                                     "allowed_actions": ["reminder"]}), "/modes/{id}", "patch", 200)
    assert m["auto_suggest"] is False and m["retention_days"] == 30 and m["allowed_actions"] == ["reminder"]
    validate(client.patch("/modes/life", json={"allowed_actions": ["teleport"]}), "/modes/{id}", "patch", 400)
    validate(client.patch("/modes/nope", json={"name": "x"}), "/modes/{id}", "patch", 404)


# ---------- MODE-2: switching ----------
def test_voice_command_switches_mode_before_perception(client):
    post(client, "Switch to student mode")
    assert active(client) == "student"
    assert "mode.changed" in types()
    post(client, "assist mode please")
    assert active(client) == "assist"


def test_switch_command_parser():
    assert modes.switch_command("Switch to Student mode") == "student"
    assert modes.switch_command("we should switch to the roadmap") is None
    assert modes.switch_command("") is None and modes.switch_command(None) is None


def test_unknown_mode_in_ingest_is_rejected(client):
    r = client.post("/moments", json={"ts": TS, "source": "glasses", "transcript": "hi", "mode": "Not A Slug!"})
    assert r.status_code == 400


def test_activate_clears_a_pending_suggestion(client):
    post(client, "Okay class, the lecture today covers the syllabus. Homework and the midterm are on the syllabus.")
    sug = mode_list(client)["suggestion"]
    assert sug and sug["mode_id"] == "student" and "mode.suggested" in types()
    validate(client.post("/modes/student/activate"), "/modes/{id}/activate", "post", 200)
    assert mode_list(client)["suggestion"] is None


def test_suggestion_yes_switches_and_dismiss_cools_down(client):
    lecture = "The professor said the lecture covers the syllabus, and the midterm and homework are next week."
    post(client, lecture)
    assert mode_list(client)["suggestion"]["mode_id"] == "student"
    a = ask(client, "yes")
    assert "Student" in a["answer"] and active(client) == "student"

    client.post("/modes/focus/activate")
    post(client, lecture)
    assert mode_list(client)["suggestion"]
    assert validate(client.post("/modes/suggestion/dismiss"), "/modes/suggestion/dismiss", "post", 200)["dismissed"]
    assert mode_list(client)["suggestion"] is None
    post(client, lecture)  # dismissed: no new suggestion inside the cooldown
    assert mode_list(client)["suggestion"] is None
    assert not validate(client.post("/modes/suggestion/dismiss"), "/modes/suggestion/dismiss", "post", 200)["dismissed"]


def test_focus_meeting_talk_never_suggests_a_switch(client):
    post(client, "In the meeting we reviewed the deck, the roadmap and the agenda with the client.")
    assert mode_list(client)["suggestion"] is None


def test_deleting_the_moment_clears_its_suggestion(client):
    m = post(client, "The professor said the lecture covers the syllabus, the midterm and homework.")
    assert mode_list(client)["suggestion"]
    assert client.delete(f"/moments/{m['id']}").status_code == 200
    assert mode_list(client)["suggestion"] is None


# ---------- Focus is frozen ----------
def test_focus_perception_prompt_is_unchanged():
    assert prompts.MODE_RULES["focus"] == ""
    # The template's last line is the original one; {mode_rules} formats to nothing for Focus.
    assert prompts.PERCEIVE.endswith("in an attached video.{mode_rules}")
    assert modes.perception_rules("focus") == ""
    assert prompts.MODE_RULES["student"] and prompts.MODE_RULES["life"] and prompts.MODE_RULES["assist"]


# ---------- MODE-1: allowed_actions filters automatic suggestions only ----------
def test_allowed_actions_filter_automatic_but_not_explicit_requests(client):
    client.post("/modes/student/activate")
    client.patch("/modes/student", json={"allowed_actions": ["notes"]})  # calendar_event no longer allowed
    m = post(client, "The midterm is due on Friday.")
    events_ = [a for a in validate(client.get("/actions"), "/actions", "get", 200)["items"] if a["type"] == "calendar_event"]
    assert not events_
    # An explicit request still works in this mode.
    explicit = client.post("/actions/propose", json={
        "type": "calendar_event", "mode": "student", "title": "Study", "source_moment_ids": [m["id"]],
        "event": {"title": "Study", "start": "2026-11-20T10:00:00-06:00", "end": "2026-11-20T11:00:00-06:00"}})
    assert explicit.status_code == 201


def test_auto_suggest_off_blocks_every_automatic_suggestion(client):
    client.post("/modes/student/activate")
    client.patch("/modes/student", json={"auto_suggest": False})
    assert not modes.allows("flashcards", "student")
    assert modes.allows("notes", "focus")


# ---------- STU: deadline -> event + study block; flashcards ----------
def test_student_deadline_proposes_an_event_and_a_study_block(client):
    client.post("/modes/student/activate")
    post(client, "Reminder: the midterm is due on Friday.")
    items = validate(client.get("/actions", params={"mode": "student"}), "/actions", "get", 200)["items"]
    kinds = [a["type"] for a in items]
    assert "calendar_event" in kinds
    assert any("tudy" in a["title"] for a in items), [a["title"] for a in items]


def test_generate_flashcards_notes_and_read_aloud(client):
    m = post(client, "Mitosis has four phases: prophase, metaphase, anaphase and telophase.")
    for kind in ("flashcards", "notes", "read_aloud"):
        a = validate(client.post("/actions/generate", json={"type": kind, "moment_id": m["id"]}),
                     "/actions/generate", "post", 201)
        assert a["status"] == "proposed" and a["source_moment_ids"] == [m["id"]]
    validate(client.post("/actions/generate", json={"type": "notes", "moment_id": "mom_nope"}),
             "/actions/generate", "post", 404)


# ---------- FOC: recap, decisions, what I owe ----------
def test_recap_decisions_and_action_items(client):
    t0 = now() - timedelta(minutes=20)
    post(client, "Kickoff for the launch. We decided to ship the beta on Friday.", ts=iso(t0))
    post(client, "Sam will send the pricing sheet by Thursday.", ts=iso(t0 + timedelta(minutes=5)))
    r = validate(client.get("/recap"), "/recap", "get", 200)
    assert r["moment_count"] == 2 and r["spoken"] and r["decisions"]
    assert validate(client.get("/recap", params={"kind": "lecture"}), "/recap", "get", 200)["kind"] == "lecture"
    tagged = validate(client.get("/moments", params={"tag": "decision"}), "/moments", "get", 200)["items"]
    assert len(tagged) == 1 and "decided" in tagged[0]["transcript"]
    assert ask(client, "What did we decide?")["answer"]
    assert ask(client, "Recap the meeting")["answer"]


def test_recap_with_nothing_captured_is_calm(client):
    r = validate(client.get("/recap"), "/recap", "get", 200)
    assert r["moment_count"] == 0 and r["spoken"]


# ---------- AST: look ----------
def test_look_without_a_view_is_409_and_find_falls_back_to_memory(client):
    validate(client.post("/look", json={"task": "describe"}), "/look", "post", 409)
    validate(client.post("/look", json={"task": "find"}), "/look", "post", 400)
    post(client, "I left my keys on the kitchen counter.")
    found = validate(client.post("/look", json={"task": "find", "target": "keys"}), "/look", "post", 200)
    assert found["task"] == "find" and found["spoken"]
    validate(client.post("/look", json={"task": "dance"}), "/look", "post", 400)


# ---------- AST: routines ----------
def test_routine_crud_and_tick(client):
    local = routines._local()
    hhmm = local.strftime("%H:%M")
    r = validate(client.post("/routines", json={"title": "Take medication", "time": hhmm, "spoken": "Time for your medication."}),
                 "/routines", "post", 201)
    assert r["active"] and r["next_at"]
    assert client.post("/routines", json={"title": "x", "time": "25:99"}).status_code == 400
    fired = routines.tick(local)
    assert [f["id"] for f in fired] == [r["id"]] and "routine.due" in types()
    assert routines.tick(local) == []  # once per day
    off = validate(client.patch(f"/routines/{r['id']}", json={"active": False}), "/routines/{id}", "patch", 200)
    assert off["active"] is False
    assert len(validate(client.get("/routines"), "/routines", "get", 200)["items"]) == 1
    validate(client.delete(f"/routines/{r['id']}"), "/routines/{id}", "delete", 200)
    validate(client.delete(f"/routines/{r['id']}"), "/routines/{id}", "delete", 404)
    validate(client.patch("/routines/rtn_nope", json={"active": True}), "/routines/{id}", "patch", 404)


# ---------- AST-6/7: caregiver ----------
def test_caregiver_consent_preview_send_undo(client):
    c = validate(client.get("/caregiver"), "/caregiver", "get", 200)
    assert c["consent"] is False and c["shares"]
    validate(client.post("/caregiver/send"), "/caregiver/send", "post", 409)  # no consent
    validate(client.put("/caregiver", json={"consent": True}), "/caregiver", "put", 400)  # needs an email

    on = validate(client.put("/caregiver", json={"consent": True, "name": "Robin", "email": "robin@example.com",
                                                 "send_at": "19:30"}), "/caregiver", "put", 200)
    assert on["consent"] and on["send_at"] == "19:30" and on["consented_at"]
    validate(client.post("/caregiver/send"), "/caregiver/send", "post", 409)  # nothing captured today

    post(client, "Took my medication and had lunch with Robin.")
    p = validate(client.get("/caregiver"), "/caregiver", "get", 200)["preview"]
    assert p["body"] and p["source_moment_ids"]
    sent = validate(client.post("/caregiver/send"), "/caregiver/send", "post", 200)
    assert sent["action"]["type"] == "caregiver_summary" and sent["action"]["status"] == "draft_saved"  # dry run
    assert sent["action"]["draft"]["to"] == "robin@example.com" and sent["receipt"]["undo"]["available"]
    undone = validate(client.post(f"/actions/{sent['action']['id']}/undo"), "/actions/{id}/undo", "post", 200)
    assert undone["action"]["status"] == "undone"

    off = validate(client.put("/caregiver", json={"consent": False}), "/caregiver", "put", 200)
    assert off["consent"] is False and off["consented_at"] is None
    validate(client.post("/caregiver/send"), "/caregiver/send", "post", 409)


# ---------- MODE-7: custom modes ----------
def test_custom_mode_create_activate_delete(client):
    m = validate(client.post("/modes", json={"name": "Lab", "allowed_actions": ["notes"], "retention_days": 14}),
                 "/modes", "post", 201)
    assert m["id"] == "lab" and m["custom"] is True and not m["active"]
    validate(client.post("/modes", json={"name": "Lab"}), "/modes", "post", 409)
    assert client.post("/modes", json={"name": "Bad", "id": "NOPE!"}).status_code == 400
    validate(client.post("/modes/lab/activate"), "/modes/{id}/activate", "post", 200)
    assert active(client) == "lab"
    post(client, "Pipetting samples now.", mode="lab")  # a custom id is accepted on ingest
    validate(client.delete("/modes/focus"), "/modes/{id}", "delete", 409)  # built-ins stay
    assert validate(client.delete("/modes/lab"), "/modes/{id}", "delete", 200)["deleted"] == "lab"
    assert active(client) == "focus"
    validate(client.delete("/modes/lab"), "/modes/{id}", "delete", 404)
