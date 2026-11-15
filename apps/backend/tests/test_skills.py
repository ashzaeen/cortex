"""Skills (#51): Ask the world, Translate, Immersion, Proactive nudge, Coach, overdue nudges, auto brief, contact search.
Offline and contract-validated. Every skill must say so when unsure and never store a frame it was not asked to keep."""
import base64
from datetime import timedelta

from core import events
from core.timeutil import iso, now, tz
from tests.contract_check import validate

IMG = b"\xff\xd8\xff\xe0 fake jpeg "
CUPS = b"\xff\xd8\xff cup table window"


def b64(raw: bytes = IMG) -> str:
    return base64.b64encode(raw).decode()


def post(c, transcript=None, source="glasses", ts=None, **extra):
    body = {"ts": ts or iso(now()), "source": source, **({"transcript": transcript} if transcript else {}), **extra}
    return validate(c.post("/moments", json=body), "/moments", "post", 201)


def call(c, method, path, template=None, status=200, **kw):
    return validate(getattr(c, method)(path, **kw), template or path, method, status)


def ask(c, q):
    return validate(c.post("/ask", json={"question": q, "channel": "voice"}), "/ask", "post", 200)


def types():
    return [e["type"] for e in events.history]


# ---------- registry, view ----------
def test_registry_lists_all_eight_skills_with_the_skl0_contract(client):
    items = call(client, "get", "/skills")["items"]
    assert [s["code"] for s in items] == [f"SKL-{i}" for i in range(1, 9)]
    assert {s["id"] for s in items} == {"network", "waiting", "brief", "world", "translate", "immersion", "nudge", "coach"}
    assert all(s["steps"] and s["if_unsure"] and s["undo"] for s in items)


def test_glasses_view_reports_no_glasses_until_a_frame_arrives(client):
    v = call(client, "get", "/skills/view")
    assert v == {"available": False, "moment_id": None, "age_seconds": None, "message": "You don't have your glasses on."}
    m = post(client, "hello", snapshot_base64=b64())
    v = call(client, "get", "/skills/view")
    assert v["available"] and v["moment_id"] == m["id"] and v["message"] is None


def test_a_stale_glasses_frame_does_not_count(client):
    post(client, "hello", snapshot_base64=b64(), ts=iso(now() - timedelta(minutes=5)))
    assert call(client, "get", "/skills/view")["available"] is False


# ---------- SKL-4 world ----------
def test_world_with_glasses_off_is_409_no_glasses(client):
    r = call(client, "post", "/skills/world", status=409, json={"source": "glasses"})
    assert r["error"]["code"] == "no_glasses" and "glasses" in r["error"]["message"]


def test_world_answers_saves_a_moment_and_is_deletable(client):
    r = call(client, "post", "/skills/world", json={"snapshot_base64": b64(b"\xff\xd8\xff a plant"), "question": "What plant is this?"})
    assert r["saved"] and not r["unsure"] and r["moment"]["id"].startswith("mom_")
    assert "skill:world" in client.get(f"/moments/{r['moment']['id']}").json()["tags"]
    assert client.delete(f"/moments/{r['moment']['id']}").status_code == 200


def test_world_unsure_says_so_and_price_is_honest(client):
    r = call(client, "post", "/skills/world", json={"snapshot_base64": b64(), "save": False})
    assert r["unsure"] and r["spoken"].startswith("I'm not sure") and not r["saved"] and r["moment"] is None
    p = call(client, "post", "/skills/world", json={"snapshot_base64": b64(), "question": "Is this a good price?", "save": False})
    assert "can't check live prices" in p["spoken"]


def test_world_uses_the_glasses_frame_when_they_are_on(client):
    post(client, "looking", snapshot_base64=b64(b"\xff\xd8\xff plant"))
    r = call(client, "post", "/skills/world", json={"source": "glasses", "question": "what plant"})
    assert "houseplant" in r["spoken"]


def test_world_when_paused_still_answers_and_stores_nothing(client):
    client.post("/privacy/pause", json={"state": "paused"})
    r = call(client, "post", "/skills/world", json={"snapshot_base64": b64(b"\xff\xd8\xff plant")})
    assert not r["saved"] and r["moment"] is None and r["spoken"]


# ---------- SKL-5 translate ----------
def test_translate_speaks_the_translation_and_remembers_the_language(client):
    r = call(client, "post", "/skills/translate", json={"text": "Hello", "target_language": "French"})
    assert r["translation"] == "bonjour" and r["spoken"] == "bonjour" and not r["unsure"] and r["moment"] is None
    s = call(client, "put", "/skills/translate/settings", json={"target_language": "German"})
    assert s["target_language"] == "german"
    assert call(client, "post", "/skills/translate", json={"text": "thank you"})["translation"] == "danke"


def test_translate_unsure_and_empty_input(client):
    r = call(client, "post", "/skills/translate", json={"text": "flibbertigibbet"})
    assert r["unsure"] and r["translation"] == "" and r["spoken"] == "I couldn't translate that."
    assert call(client, "post", "/skills/translate", status=400, json={})["error"]["code"] == "bad_request"
    assert call(client, "put", "/skills/translate/settings", "/skills/translate/settings", 400, json={"target_language": " "})


def test_translate_save_stores_a_moment(client):
    r = call(client, "post", "/skills/translate", json={"text": "hello", "target_language": "spanish", "save": True})
    assert r["moment"] and "hola" in client.get(f"/moments/{r['moment']['id']}").json()["transcript"]


# ---------- SKL-6 immersion ----------
def test_immersion_names_saves_and_quizzes(client):
    r = call(client, "post", "/skills/immersion/name", json={"snapshot_base64": b64(CUPS), "language": "Spanish"})
    assert r["items"] and r["moment"] and r["items"][0]["source_moment_id"] == r["moment"]["id"]
    words = {i["object"]: i["word"] for i in r["items"]}
    assert words["cup"] == "la taza"
    again = call(client, "post", "/skills/immersion/name", json={"snapshot_base64": b64(CUPS), "language": "spanish"})
    assert len(call(client, "get", "/skills/immersion/vocab")["items"]) == len(r["items"]) == len(again["items"])
    q = call(client, "get", "/skills/immersion/quiz")
    assert q["prompt"].startswith("How do you say") and len(q["choices"]) >= 2
    obj = q["object"]
    wrong = call(client, "post", "/skills/immersion/quiz", json={"vocab_id": q["vocab_id"], "answer": "nope"})
    assert wrong["correct"] is False and wrong["box"] == 1
    right = call(client, "post", "/skills/immersion/quiz", json={"vocab_id": q["vocab_id"], "answer": words[obj].split()[-1].upper()})
    assert right["correct"] is True and right["box"] == 2


def test_immersion_nothing_visible_and_empty_quiz_and_delete(client):
    r = call(client, "post", "/skills/immersion/name", json={"snapshot_base64": b64(), "language": "klingon"})
    assert r["items"] == [] and r["moment"] is None and "can't see anything clear" in r["spoken"]
    assert call(client, "get", "/skills/immersion/quiz", status=409)["error"]["code"] == "no_vocab"
    ok = call(client, "post", "/skills/immersion/name", json={"snapshot_base64": b64(), "language": "german"})
    vid = ok["items"][0]["id"]
    assert call(client, "delete", f"/skills/immersion/vocab/{vid}", "/skills/immersion/vocab/{id}")["deleted"]
    assert call(client, "delete", f"/skills/immersion/vocab/{vid}", "/skills/immersion/vocab/{id}", 404)


# ---------- SKL-7 proactive nudge ----------
def test_proactive_is_off_by_default_and_never_acts_on_its_own(client):
    assert call(client, "get", "/skills/proactive/settings") == {"enabled": False, "dwell_seconds": 20, "cooldown_minutes": 30}
    o = call(client, "post", "/skills/proactive/observe", json={"snapshot_base64": b64(b"\xff\xd8\xff confusing")})
    assert o["offered"] is False and o["reason"] == "disabled"
    assert "skill.offer" not in types()


def test_proactive_waits_for_the_dwell_then_offers_once_then_cools_down(client):
    call(client, "put", "/skills/proactive/settings", json={"enabled": True, "dwell_seconds": 600})
    frame = {"snapshot_base64": b64(b"\xff\xd8\xff confusing")}
    assert call(client, "post", "/skills/proactive/observe", json=frame)["reason"] == "watching"
    assert call(client, "post", "/skills/proactive/observe", json={"snapshot_base64": b64(b"\xff\xd8\xff calm")})["reason"] == "nothing_confusing"
    call(client, "put", "/skills/proactive/settings", json={"dwell_seconds": 0})
    first = call(client, "post", "/skills/proactive/observe", json=frame)
    assert first["offered"] and first["offer"]["status"] == "offered" and "skill.offer" in types()
    assert call(client, "post", "/skills/proactive/observe", json=frame)["reason"] == "cooldown"
    assert len(call(client, "get", "/skills/proactive/offers")["items"]) == 1


def test_proactive_accept_explains_and_dismiss_doubles_the_quiet_time(client):
    call(client, "put", "/skills/proactive/settings", json={"enabled": True, "dwell_seconds": 0, "cooldown_minutes": 0})
    frame = {"snapshot_base64": b64(b"\xff\xd8\xff confusing")}
    off = call(client, "post", "/skills/proactive/observe", json=frame)["offer"]
    got = call(client, "post", f"/skills/proactive/offers/{off['id']}/accept", "/skills/proactive/offers/{id}/accept", json=frame)
    assert got["spoken"]
    assert call(client, "get", "/skills/proactive/offers")["items"] == []
    off2 = call(client, "post", "/skills/proactive/observe", json=frame)["offer"]
    d = call(client, "post", f"/skills/proactive/offers/{off2['id']}/dismiss", "/skills/proactive/offers/{id}/dismiss")
    assert d["status"] == "dismissed"
    call(client, "post", f"/skills/proactive/offers/{off2['id']}/dismiss", "/skills/proactive/offers/{id}/dismiss", 200)


def test_proactive_settings_are_validated(client):
    assert call(client, "put", "/skills/proactive/settings", status=400, json={"dwell_seconds": 9999}) is not None


# ---------- SKL-8 coach ----------
def test_coach_walks_the_steps_corrects_a_mistake_and_saves_a_summary(client):
    r = call(client, "post", "/skills/coach", status=201, json={"goal": "fix a dripping tap"})
    sid, n = r["session"]["id"], len(r["session"]["steps"])
    assert n >= 3 and r["session"]["step_index"] == 0 and r["spoken"].startswith(f"Step 1 of {n}")
    step = lambda **b: call(client, "post", f"/skills/coach/{sid}/step", "/skills/coach/{id}/step", json=b)  # noqa: E731
    assert step(said="hmm")["session"]["step_index"] == 0
    bad = step(said="oops, I broke the washer")
    assert bad["mistake"] and bad["session"]["mistakes"] == 1 and bad["session"]["step_index"] == 0
    assert step(said="next")["session"]["step_index"] == 1
    assert step(said="say that again")["session"]["step_index"] == 1
    assert step(said="go back")["session"]["step_index"] == 0
    for _ in range(n):
        last = step(said="done")
    assert last["session"]["status"] == "done" and last["session"]["moment_id"]
    assert "coach.updated" in types()
    m = client.get(f"/moments/{last['session']['moment_id']}").json()
    assert "skill:coach" in m["tags"]
    assert call(client, "post", f"/skills/coach/{sid}/step", "/skills/coach/{id}/step", 409, json={"said": "next"})


def test_coach_without_a_clear_goal_asks_instead_of_inventing_steps(client):
    r = call(client, "post", "/skills/coach", status=400, json={"goal": "x"})
    assert r["error"]["code"] == "bad_request"


def test_coach_end_and_list(client):
    sid = call(client, "post", "/skills/coach", status=201, json={"goal": "make pancakes"})["session"]["id"]
    assert call(client, "post", f"/skills/coach/{sid}/end", "/skills/coach/{id}/end")["status"] == "ended"
    assert call(client, "get", f"/skills/coach/{sid}", "/skills/coach/{id}")["status"] == "ended"
    assert len(call(client, "get", "/skills/coach")["items"]) == 1


# ---------- WAI-5 / WAI-6 / WAI-7 ----------
def overdue(client, days=3, due_text="Friday", direction="waiting_on"):
    m = post(client, "This is Ash from Acme.")
    pid = client.get("/people").json()["items"][0]["id"]
    p = validate(client.post("/promises", json={"direction": direction, "person_id": pid, "what": "Send the deck",
                                                "due_text": due_text, "source_moment_id": m["id"]}), "/promises", "post", 201)
    call(client, "post", f"/promises/{p['id']}/confirm", "/promises/{id}/confirm")
    from core import db

    day = (now().astimezone(tz()).date() - timedelta(days=days)).isoformat()
    db.col("promises").update_one({"_id": p["id"]}, {"$set": {"due": {"date": day, "inferred": False, "text": "x"}}})
    return p["id"], pid


def noon():
    return now().astimezone(tz()).replace(hour=12, minute=0)


def test_default_nudge_settings(client):
    assert call(client, "get", "/skills/nudges/settings") == {"enabled": True, "quiet_start": "22:00", "quiet_end": "08:00", "daily_cap": 3}


def test_overdue_promise_nudges_once_a_day_and_offers_the_follow_up(client):
    pid, _ = overdue(client)
    from skills import nudges

    fired = nudges.tick(noon())
    assert len(fired) == 1 and fired[0]["promise_id"] == pid and fired[0]["days_overdue"] == 3
    assert "nudge.due" in types()
    assert [a["type"] for a in client.get("/actions").json()["items"]].count("follow_up_email") >= 1
    assert nudges.tick(noon()) == []  # never twice for the same promise in one day
    items = call(client, "get", "/skills/nudges")["items"]
    assert len(items) == 1
    assert call(client, "post", f"/skills/nudges/{items[0]['id']}/dismiss", "/skills/nudges/{id}/dismiss")["status"] == "dismissed"


def test_nudges_respect_quiet_hours_cap_and_never_guess_a_date(client):
    from skills import nudges

    overdue(client)
    assert nudges.tick(noon().replace(hour=23)) == []
    assert nudges.tick(noon().replace(hour=7, minute=59)) == []
    assert nudges.tick(noon().replace(hour=8)) != []
    call(client, "put", "/skills/nudges/settings", json={"daily_cap": 0})
    assert nudges.tick(noon().replace(hour=13)) == []
    assert call(client, "put", "/skills/nudges/settings", status=400, json={"quiet_start": "25:00"}) is not None


def test_a_promise_with_no_date_is_never_nudged(client):
    from core import db
    from skills import nudges

    pid, _ = overdue(client)
    db.col("promises").update_one({"_id": pid}, {"$set": {"due": {"date": None, "inferred": False, "text": "sometime"}}})
    assert nudges.tick(noon()) == []


def test_close_out_with_a_tap_or_got_it(client):
    pid, _ = overdue(client)
    assert call(client, "post", f"/promises/{pid}/done", "/promises/{id}/done")["status"] == "done"
    overdue(client)  # a second open promise, now the only confirmed one
    r = ask(client, "Got it")
    assert r["spoken"] == "Marked done: Send the deck." and r["grounded"]
    assert all(p["status"] == "done" for p in client.get("/promises").json()["items"] if p["status"] != "proposed")
    assert "Marked done" not in ask(client, "Got it")["spoken"]  # nothing left to close


def test_cannot_close_out_an_unconfirmed_promise(client):
    m = post(client, "This is Ash from Acme.")
    pid = client.get("/people").json()["items"][0]["id"]
    p = validate(client.post("/promises", json={"direction": "waiting_on", "person_id": pid, "what": "x y z", "source_moment_id": m["id"]}),
                 "/promises", "post", 201)
    assert call(client, "post", f"/promises/{p['id']}/done", "/promises/{id}/done", 409)["error"]["code"] == "not_confirmed"
    assert call(client, "post", f"/promises/{p['id']}/dismiss", "/promises/{id}/dismiss")["status"] == "dismissed"


# ---------- BRF-6 / BRF-7 ----------
def calendar(client, minutes, title="Meeting with Ash"):
    from core import db
    from core.ids import new_id

    start = now() + timedelta(minutes=minutes)
    m = post(client, "x y z")
    db.col("actions").insert_one({"_id": new_id("act"), "type": "calendar_event", "status": "done", "mode": "focus", "title": title,
                                  "source_moment_ids": [m["id"]], "event": {"title": title, "start": start.isoformat(),
                                                                           "end": (start + timedelta(hours=1)).isoformat()},
                                  "created_at": now()})


def test_auto_brief_fires_once_within_ten_minutes_for_a_known_person(client):
    post(client, "This is Ash from Acme.")
    calendar(client, 45)
    assert call(client, "post", "/skills/brief/tick")["items"] == []  # too early
    calendar(client, 6)
    got = call(client, "post", "/skills/brief/tick")["items"]
    assert len(got) == 1 and got[0]["event_title"] == "Meeting with Ash" and "Ash" in got[0]["spoken"]
    assert "brief.due" in types()
    assert call(client, "post", "/skills/brief/tick")["items"] == []  # once per event


def test_auto_brief_skips_events_that_name_nobody_on_file_and_can_be_turned_off(client):
    post(client, "This is Ash from Acme.")
    calendar(client, 5, title="Dentist")
    assert call(client, "post", "/skills/brief/tick")["items"] == []
    call(client, "put", "/skills/brief/settings", json={"enabled": False})
    calendar(client, 5)
    assert call(client, "post", "/skills/brief/tick")["items"] == []


def test_brief_by_call_is_queued_honestly(client):
    post(client, "This is Ash from Acme.")
    pid = client.get("/people").json()["items"][0]["id"]
    r = call(client, "post", "/skills/brief/call", status=201, json={"person_id": pid})
    assert r["status"] == "requested" and "brief.call" in types()
    upd = call(client, "patch", f"/skills/brief/call/{r['id']}", "/skills/brief/call/{id}", json={"status": "dialing"})
    assert upd["status"] == "dialing"
    assert call(client, "get", f"/skills/brief/call/{r['id']}", "/skills/brief/call/{id}")["status"] == "dialing"
    assert call(client, "post", "/skills/brief/call", status=404, json={"person_id": "per_nobody"})


# ---------- NET-5 contact search and /ask routes ----------
def test_contact_search_finds_by_company_topic_and_says_when_nobody_matches(client):
    post(client, "This is Ash from Acme.")
    hit = call(client, "get", "/skills/people/search", params={"q": "who works at Acme"})["items"]
    assert [h["person"]["name"] for h in hit] == ["Ash"] and hit[0]["matched"] == ["acme"]
    assert call(client, "get", "/skills/people/search", params={"q": "zebra"})["items"] == []
    assert call(client, "get", "/skills/people/search", status=400, params={"q": ""}) is not None


def test_ask_routes_for_the_skills(client):
    post(client, "This is Ash from Acme.")
    assert "Ash" in ask(client, "Who did I meet from Acme?")["spoken"]
    assert "I don't have anyone" in ask(client, "Who did I meet that works at Nowhere?")["spoken"]
    assert ask(client, "Translate to french: hello")["spoken"] == "bonjour"
    assert ask(client, "How do you say thank you in german")["spoken"] == "danke"
    assert "glasses" in ask(client, "What is this?")["spoken"]
    assert "glasses" not in ask(client, "Who did I meet from Acme?")["spoken"]
    assert ask(client, "Name things in Spanish")["spoken"] == "You don't have your glasses on."
    assert ask(client, "Quiz me")["spoken"] == "Name a few things first, then I can quiz you."
    c = ask(client, "Coach me through fixing a leaking tap")
    assert c["spoken"].startswith("Step 1")
    assert len(client.get("/skills/coach").json()["items"]) == 1


def test_ask_what_is_this_uses_the_glasses_frame(client):
    post(client, "looking", snapshot_base64=b64(b"\xff\xd8\xff plant"))
    r = ask(client, "What plant is this?")
    assert "houseplant" in r["spoken"] and r["sources"]


def test_coach_stops_for_injury_words_and_believes_a_plain_next(client):
    sid = call(client, "post", "/skills/coach", status=201, json={"goal": "make a cup of tea"})["session"]["id"]
    step = lambda **b: call(client, "post", f"/skills/coach/{sid}/step", "/skills/coach/{id}/step", json=b)  # noqa: E731
    hurt = step(said="ow I burnt my hand")
    assert hurt["mistake"].startswith("Stop. If anyone is hurt") and hurt["session"]["step_index"] == 0
    assert step(said="ok the kettle is filled, next")["session"]["step_index"] == 1  # no frame: believe the wearer
