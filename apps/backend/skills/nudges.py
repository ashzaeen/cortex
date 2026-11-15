"""WAI-5 and WAI-6 overdue nudges for the waiting-on tracker (SKL-2).

Trigger: the skill ticker, every minute or so. Inputs: confirmed promises past their stated due date. Steps: pick the
oldest overdue ones, skip a promise already nudged today, stay silent in quiet hours, stop at the daily cap, then
publish `nudge.due` (clients speak it and show it) and, for something someone owes you, propose the follow-up email
(WAI-6, through the normal approval loop). Output: a nudge record. Confirmation: the nudge only speaks; the follow-up
is a proposal the user approves. Undo: dismiss a nudge, or mark the promise done. Source moment: the promise's.
If unsure: a promise with no stated date is never nudged (the date is never guessed)."""
from datetime import datetime

from core import background, db, events
from core.errors import ApiError, not_found
from core.ids import new_id
from core.timeutil import iso, now, tz
from skills import kit

DEFAULTS = {"enabled": True, "quiet_start": "22:00", "quiet_end": "08:00", "daily_cap": 3}


def settings(patch: dict | None = None) -> dict:
    if patch:
        for k in ("quiet_start", "quiet_end"):
            if k in patch and not _hhmm(patch[k]):
                raise ApiError(400, "bad_request", f"{k} must be HH:MM (24-hour).")
        if "daily_cap" in patch and not 0 <= int(patch["daily_cap"]) <= 20:
            raise ApiError(400, "bad_request", "daily_cap must be 0 to 20.")
        return kit.save_settings("nudges", DEFAULTS, patch)
    return kit.get_settings("nudges", DEFAULTS)


def _hhmm(v) -> bool:
    try:
        datetime.strptime(str(v), "%H:%M")
        return True
    except ValueError:
        return False


def in_quiet_hours(local: datetime, cfg: dict) -> bool:
    cur = local.strftime("%H:%M")
    start, end = cfg["quiet_start"], cfg["quiet_end"]
    if start == end:
        return False
    return start <= cur < end if start < end else (cur >= start or cur < end)


def out(d: dict) -> dict:
    return {"id": d["_id"], "promise_id": d["promise_id"], "person_id": d["person_id"], "direction": d["direction"],
            "spoken": d["spoken"], "text": d["text"], "days_overdue": d["days_overdue"], "status": d["status"],
            "source_moment_id": d["source_moment_id"], "created_at": iso(d["created_at"])}


def _line(p: dict, person: dict, days: int) -> str:
    first = person["name"].split()[0]
    late = "today" if days == 0 else f"{days} day{'s' if days != 1 else ''} ago"
    what = p["what"][0].lower() + p["what"][1:]
    if p["direction"] == "waiting_on":
        return f"{first} was meant to {what}; that was due {late}. Want me to draft a nudge?"
    return f"You promised {first} to {what}; that was due {late}."


def tick(ref: datetime | None = None) -> list[dict]:
    cfg = settings()
    ref = (ref or now()).astimezone(tz())
    if not cfg["enabled"] or in_quiet_hours(ref, cfg):
        return []
    today = ref.date().isoformat()
    sent = list(db.col("nudges").find({"day": today}))
    room = cfg["daily_cap"] - len(sent)
    already = {n["promise_id"] for n in sent}
    due = sorted((p for p in db.col("promises").find({"status": "confirmed"})
                  if (p.get("due") or {}).get("date") and p["due"]["date"] < today and p["_id"] not in already),
                 key=lambda p: p["due"]["date"])
    fired = []
    for p in due[:max(room, 0)]:
        person = db.col("people").find_one({"_id": p["person_id"]})
        if not person:
            continue
        days = (ref.date() - datetime.fromisoformat(p["due"]["date"]).date()).days
        line = _line(p, person, days)
        doc = {"_id": new_id("ndg"), "promise_id": p["_id"], "person_id": p["person_id"], "direction": p["direction"],
               "spoken": line, "text": line, "days_overdue": days, "status": "open", "day": today,
               "source_moment_id": p["source_moment_id"], "created_at": now()}
        db.col("nudges").insert_one(doc)
        events.publish("nudge.due", out(doc))
        if p["direction"] == "waiting_on":  # WAI-6: offer the follow-up; the user still approves it
            from actions import followup

            background.run(followup.auto_propose, p["person_id"])
        fired.append(out(doc))
    return fired


def list_today() -> list[dict]:
    day = now().astimezone(tz()).date().isoformat()
    return [out(d) for d in db.col("nudges").find({"day": day}).sort("created_at", -1)]


def dismiss(nudge_id: str) -> dict:
    d = db.col("nudges").find_one({"_id": nudge_id})
    if not d:
        raise not_found("nudge")
    db.col("nudges").update_one({"_id": nudge_id}, {"$set": {"status": "dismissed"}})
    return out({**d, "status": "dismissed"})

