"""BRF-6 automatic pre-meeting brief and BRF-7 brief by outbound call (SKL-3).

Trigger: the skill ticker. Inputs: calendar events Cortex holds (approved calendar actions) that start within the
next 10 minutes and name someone on file. Steps: find the person, build the normal brief, publish `brief.due` once
per event (clients speak it and show the card). Output: the brief plus the event. Confirmation: it only speaks; the
brief-by-call needs the user to ask for it. Undo: nothing changes. Source moments: the brief's own. If unsure:
an event with no known person gets no brief, and a person with no history gets "nothing on file".

BRF-7 queues a call request and publishes `brief.call`. Dialing the user's phone is the call agent's job
(area:call): until it consumes that event the request stays `requested` and the app says so."""
from datetime import timedelta

from core import db, events
from core.errors import ApiError, not_found
from core.ids import new_id
from core.timeutil import iso, now
from memory import store
from skills import brief, kit, network

LEAD = timedelta(minutes=10)
DEFAULTS = {"enabled": True}


def settings(patch: dict | None = None) -> dict:
    return kit.save_settings("autobrief", DEFAULTS, patch) if patch else kit.get_settings("autobrief", DEFAULTS)


def upcoming(ref=None) -> list[dict]:
    """Approved calendar actions starting within LEAD, soonest first."""
    t = ref or now()
    found = []
    for a in db.col("actions").find({"type": "calendar_event", "status": {"$in": ["done", "sent"]}}):
        start = store.as_dt((a.get("event") or {}).get("start"))
        if start and t <= start <= t + LEAD:
            found.append({"action_id": a["_id"], "title": a["event"].get("title") or a.get("title") or "", "start": start})
    return sorted(found, key=lambda e: e["start"])


def tick(ref=None) -> list[dict]:
    if not settings()["enabled"]:
        return []
    fired = []
    for ev in upcoming(ref):
        if db.col("brief_log").find_one({"_id": ev["action_id"]}):
            continue
        people = network.mentioned_in(ev["title"])
        db.col("brief_log").insert_one({"_id": ev["action_id"], "at": now()})
        if not people:
            continue
        b = brief.brief(people[0]["_id"])
        payload = {"person_id": people[0]["_id"], "event_title": ev["title"], "event_start": iso(ev["start"]),
                   "spoken": b["spoken"], "bullets": b["bullets"]}
        events.publish("brief.due", payload)
        fired.append(payload)
    return fired


def request_call(person_id: str) -> dict:
    person = network.get(person_id)
    b = brief.brief(person_id)
    doc = {"_id": new_id("bcl"), "person_id": person["_id"], "status": "requested", "spoken": b["spoken"], "created_at": now()}
    db.col("brief_calls").insert_one(doc)
    out = {"id": doc["_id"], "person_id": person["_id"], "status": "requested", "spoken": b["spoken"],
           "created_at": iso(doc["created_at"])}
    events.publish("brief.call", out)
    return out


def get_call(call_id: str) -> dict:
    d = db.col("brief_calls").find_one({"_id": call_id})
    if not d:
        raise not_found("brief call")
    return {"id": d["_id"], "person_id": d["person_id"], "status": d["status"], "spoken": d["spoken"],
            "created_at": iso(d["created_at"])}


def mark_call(call_id: str, status: str) -> dict:
    if status not in {"dialing", "completed", "failed"}:
        raise ApiError(400, "bad_request", "status must be dialing, completed or failed.")
    get_call(call_id)
    db.col("brief_calls").update_one({"_id": call_id}, {"$set": {"status": status}})
    return get_call(call_id)
