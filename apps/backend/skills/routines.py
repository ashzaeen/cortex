"""Routine reminders (AST-5): reminders at times the user set, spoken when due.

A routine fires once per day at its local time (on its days; no days = every day): the backend publishes
routine.due and clients speak its line. "What time is my next medicine reminder?" is answered from here.
One ticker thread (start_ticker) checks every user this process has served, and also runs the daily
caregiver summary (skills/caregiver.py). Wellness support, not a medical device."""
import logging
import re
import threading
import time
from datetime import datetime, timedelta

from core import db, events
from core.errors import ApiError, not_found
from core.ids import new_id
from core.timeutil import iso, now, tz

log = logging.getLogger(__name__)
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
TIME = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
WINDOW = timedelta(minutes=2)  # a routine fires if the ticker sees it within this long after its time


def _local() -> datetime:
    return now().astimezone(tz())


def _at(doc: dict, day: datetime) -> datetime:
    h, m = map(int, doc["time"].split(":"))
    return day.replace(hour=h, minute=m, second=0, microsecond=0)


def _on(doc: dict, day: datetime) -> bool:
    return not doc.get("days") or DAYS[day.weekday()] in doc["days"]


def next_at(doc: dict, ref: datetime | None = None) -> datetime | None:
    if not doc.get("active", True):
        return None
    ref = ref or _local()
    for i in range(8):
        day = ref + timedelta(days=i)
        at = _at(doc, day)
        if _on(doc, day) and at >= ref.replace(second=0, microsecond=0):
            return at
    return None


def out(doc: dict) -> dict:
    nxt = next_at(doc)
    return {"id": doc["_id"], "title": doc["title"], "time": doc["time"], "days": list(doc.get("days") or []),
            "spoken": doc.get("spoken") or f"Reminder: {doc['title']}.", "active": bool(doc.get("active", True)),
            "next_at": iso(nxt) if nxt else None, "created_at": iso(doc["created_at"])}


def _check(fields: dict):
    if "time" in fields and not TIME.match(fields["time"] or ""):
        raise ApiError(400, "bad_request", "time must be HH:MM (24-hour).")
    if "days" in fields:
        bad = [d for d in fields["days"] or [] if d not in DAYS]
        if bad:
            raise ApiError(400, "bad_request", f"Unknown day: {', '.join(bad)}.")
        fields["days"] = [d for d in DAYS if d in (fields["days"] or [])]


def list_all() -> list[dict]:
    items = [out(d) for d in db.col("routines").find()]
    return sorted(items, key=lambda r: (r["next_at"] is None, r["next_at"] or "", r["time"]))


def create(body: dict) -> dict:
    title = (body.get("title") or "").strip()
    if not title:
        raise ApiError(400, "bad_request", "title is required.")
    fields = {"time": body.get("time"), "days": body.get("days") or []}
    _check(fields)
    doc = {"_id": new_id("rtn"), "title": title[:120], **fields, "spoken": (body.get("spoken") or "").strip() or None,
           "active": True, "created_at": now(), "last_fired": None}
    db.col("routines").insert_one(doc)
    return out(doc)


def update(routine_id: str, fields: dict) -> dict:
    if not db.col("routines").find_one({"_id": routine_id}):
        raise not_found("routine")
    fields = {k: v for k, v in fields.items() if k in {"title", "time", "days", "spoken", "active"}}
    _check(fields)
    if fields:
        db.col("routines").update_one({"_id": routine_id}, {"$set": fields})
    return out(db.col("routines").find_one({"_id": routine_id}))


def delete(routine_id: str) -> dict:
    if not db.col("routines").delete_one({"_id": routine_id}).deleted_count:
        raise not_found("routine")
    return {"deleted": routine_id}


def next_matching(question: str) -> dict | None:
    """The next routine whose title shares a word with the question, else the next one at all."""
    items = [r for r in list_all() if r["next_at"]]
    words = {w for w in re.findall(r"[a-z]{4,}", question.lower())} - {"what", "time", "next", "reminder", "when", "routine"}
    hit = next((r for r in items if words & set(re.findall(r"[a-z]{4,}", r["title"].lower()))), None)
    return hit or (items[0] if items else None)


# ---------- the ticker ----------
def tick(ref: datetime | None = None) -> list[dict]:
    """Fire routines due now for the current user. Returns what fired (tests call this directly)."""
    ref = (ref or now()).astimezone(tz())
    fired = []
    for doc in db.col("routines").find({"active": True}):
        at = _at(doc, ref)
        if not _on(doc, ref) or doc.get("last_fired") == ref.date().isoformat() or not (at <= ref < at + WINDOW):
            continue
        db.col("routines").update_one({"_id": doc["_id"]}, {"$set": {"last_fired": ref.date().isoformat()}})
        r = out(doc)
        events.publish("routine.due", r)
        fired.append(r)
    return fired


def _loop(interval: float):
    from core import user
    from skills import caregiver

    while True:
        for who in sorted(user.known() | {user.DEFAULT}):
            token = user._current.set(who)
            try:
                tick()
                caregiver.maybe_send_daily()
            except Exception:  # noqa: BLE001
                log.exception("routine ticker failed for a user")
            finally:
                user._current.reset(token)
        time.sleep(interval)


def start_ticker(interval: float = 20.0):
    threading.Thread(target=_loop, args=(interval,), daemon=True, name="cortex-ticker").start()
