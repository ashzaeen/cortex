"""Caregiver summary (AST-6, AST-7): a daily email to a caregiver the user chose, only with consent.

GET /caregiver shows exactly what today's email would say. With consent, the ticker sends it once a day at
send_at (skills/routines.py), as a caregiver_summary action with a receipt and the usual undo window;
EMAIL_DRY_RUN keeps it a draft. Revoking consent stops it at once. The summary never includes photos,
video, transcripts or the names of people the user met: only counts, routines and the user's own reminders."""
import logging
import re
import threading
from datetime import timedelta

from core import content, contract, db, events, receipts, tiger, user
from core.config import settings
from core.errors import ApiError
from core.ids import new_id
from core.timeutil import iso, now, parse_dt, tz
from skills import routines

log = logging.getLogger(__name__)
_timers: dict[str, threading.Timer] = {}
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
SEND_WINDOW = timedelta(minutes=30)
SHARES = [
    "How many moments Cortex captured today (a number only)",
    "Your routine reminders for today and their times",
    "Reminders you set today",
    "Never shared: photos, video, what was said, or who you met",
]


def _state() -> dict:
    return db.col("state").find_one({"_id": "caregiver"}) or {"_id": "caregiver", "consent": False, "name": None,
                                                                "email": None, "send_at": "20:00"}


def _day_bounds():
    local = now().astimezone(tz())
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _tidy(title: str) -> str:
    """"Remind me to pay Jamie back" -> "Pay Jamie back": a reminder reads as what to do, not as a command to Cortex."""
    t = re.sub(r"(?i)^remind me (?:to |that |about )?", "", (title or "").strip()).strip()
    return (t[:1].upper() + t[1:]) if t else title


def _note(who: str, moments: int, todays: list[dict], reminders: list[str]) -> str:
    """Two warm sentences from the same counts and titles the email lists, nothing else (never photos, speech or people)."""
    facts = "\n".join([f"- Moments captured today: {moments}",
                       *[f"- Routine: {r['title']} at {r['time']}" for r in todays[:6]],
                       *[f"- Reminder: {t}" for t in reminders[:6]]])
    try:
        text = str((content.run("caregiver", caregiver=who, facts=facts) or {}).get("summary") or "").strip()
    except Exception:  # noqa: BLE001 - the email never depends on the model
        log.exception("caregiver note failed; sending the plain summary")
        return ""
    return text if 20 <= len(text) <= 400 else ""


def preview() -> dict:
    st = _state()
    start, end = _day_bounds()
    moments = list(db.col("moments").find({"ts": {"$gte": start, "$lt": end}}, {"_id": 1}))
    todays = [r for r in routines.list_all() if r["active"] and (not r["days"] or routines.DAYS[start.weekday()] in r["days"])]
    reminders = [a["title"] for a in db.col("actions").find({"type": "reminder", "created_at": {"$gte": start, "$lt": end},
                                                             "status": {"$nin": ["dismissed", "undone"]}})]
    who = st.get("name") or "there"
    reminders = [_tidy(t) for t in reminders]
    note = _note(who, len(moments), todays, reminders)
    lines = [f"Hi {who},", "", f"Here is today's Cortex summary ({start:%A, %b} {start.day}).", "", *([note, ""] if note else []),
             f"- Moments captured today: {len(moments)}"]
    lines += [f"- Routine: {r['title']} at {r['time']}" for r in sorted(todays, key=lambda r: r["time"])] or [
        "- No routine reminders today"]
    lines += [f"- Reminder set: {t}" for t in reminders[:10]]
    lines += ["", "This is shared with consent and can be stopped at any time. Cortex is support, not a medical device."]
    return {"subject": f"Today's Cortex summary ({start:%b} {start.day})", "body": "\n".join(lines),
            "source_moment_ids": [m["_id"] for m in moments]}


def get() -> dict:
    st = _state()
    return {"consent": bool(st.get("consent")), "name": st.get("name"), "email": st.get("email"),
            "send_at": st.get("send_at") or "20:00", "consented_at": iso(st.get("consented_at")),
            "last_sent_at": iso(st.get("last_sent_at")), "shares": SHARES, "preview": preview()}


def put(body: dict) -> dict:
    st = _state()
    consent = bool(body.get("consent"))
    email = (body.get("email") if "email" in body else st.get("email")) or None
    if consent and not (email and EMAIL.match(email)):
        raise ApiError(400, "bad_request", "A valid caregiver email is required to share.")
    send_at = body.get("send_at") or st.get("send_at") or "20:00"
    if not routines.TIME.match(send_at):
        raise ApiError(400, "bad_request", "send_at must be HH:MM (24-hour).")
    fields = {"consent": consent, "email": email, "name": (body.get("name") if "name" in body else st.get("name")) or None,
              "send_at": send_at,
              "consented_at": (st.get("consented_at") if st.get("consent") else now()) if consent else None}
    db.col("state").update_one({"_id": "caregiver"}, {"$set": fields}, upsert=True)
    tiger.log_action(tiger.user(), now(), None, "caregiver.consent" if consent else "caregiver.revoked", "user")
    return get()


def _deliver_later(action_id: str):
    def fire():
        _timers.pop(action_id, None)
        doc = db.col("actions").find_one({"_id": action_id})
        if not doc or doc["status"] != "sent":
            return
        try:
            from actions import email

            email.send(doc["draft"]["to"], doc["draft"]["subject"], doc["draft"]["body"])
            receipts.close_undo(action_id)
        except Exception as exc:  # noqa: BLE001
            log.error("caregiver summary delivery failed: %s", exc)
            db.col("actions").update_one({"_id": action_id}, {"$set": {"status": "failed", "error": str(exc)[:300]}})
            events.publish("action.updated", contract.action(db.col("actions").find_one({"_id": action_id})))
            receipts.create("action", f"Could not send the caregiver summary: {exc}", doc["source_moment_ids"], action_id)

    t = threading.Timer(settings.undo_seconds, user.carry(fire))
    t.daemon = True
    _timers[action_id] = t
    t.start()


def send() -> dict:
    from actions import email

    st = _state()
    if not st.get("consent") or not st.get("email"):
        raise ApiError(409, "no_consent", "Caregiver sharing is off. Turn it on with a caregiver's email first.")
    p = preview()
    if not p["source_moment_ids"]:
        raise ApiError(409, "nothing_today", "Nothing was captured today, so there is no summary to send.")
    draft = {"to": st["email"], "subject": p["subject"], "body": p["body"]}
    sending = email.can_send()
    doc = {"_id": new_id("act"), "type": "caregiver_summary", "status": "sent" if sending else "draft_saved", "mode": "assist",
           "title": f"Today's summary for {st.get('name') or st['email']}", "person_id": None, "draft": draft,
           "source_moment_ids": p["source_moment_ids"], "created_at": now(), "confirmed_at": now()}
    db.col("actions").insert_one(doc)
    db.col("state").update_one({"_id": "caregiver"}, {"$set": {"last_sent_at": now()}})
    events.publish("action.updated", contract.action(doc))
    who = st.get("name") or st["email"]
    if sending:
        _deliver_later(doc["_id"])
        summary = f"Sending today's summary to {who} ({st['email']})."
    else:
        db.col("drafts").insert_one({"_id": new_id("drf"), "action_id": doc["_id"], **draft, "created_at": now()})
        summary = f"Saved today's summary for {who} as a draft. (Dry run: sending is off.)"
    rcp = receipts.create("action", summary, doc["source_moment_ids"], doc["_id"],
                          undo_until=now() + timedelta(seconds=settings.undo_seconds))
    return {"action": contract.action(doc), "receipt": rcp}


def undo(doc: dict) -> dict:
    if doc["status"] not in {"sent", "draft_saved"}:
        raise ApiError(409, "not_undoable", f"Action is {doc['status']}.")
    open_rcp = db.col("receipts").find_one({"action_id": doc["_id"], "undo.available": True})
    if not open_rcp or (open_rcp["undo"].get("until") and open_rcp["undo"]["until"] < now()):
        raise ApiError(409, "undo_expired", "The undo window has closed.")
    timer = _timers.pop(doc["_id"], None)
    if timer:
        timer.cancel()
    db.col("drafts").delete_many({"action_id": doc["_id"]})
    receipts.close_undo(doc["_id"])
    db.col("actions").update_one({"_id": doc["_id"]}, {"$set": {"status": "undone", "undone_at": now()}})
    doc = db.col("actions").find_one({"_id": doc["_id"]})
    events.publish("action.updated", contract.action(doc))
    rcp = receipts.create("action", "Cancelled today's caregiver summary.", doc["source_moment_ids"], doc["_id"])
    return {"action": contract.action(doc), "receipt": rcp}


def maybe_send_daily():
    """Ticker: send once a day, within 30 minutes after send_at, while consent stands."""
    st = _state()
    if not st.get("consent") or not st.get("email"):
        return None
    local = now().astimezone(tz())
    h, m = map(int, (st.get("send_at") or "20:00").split(":"))
    at = local.replace(hour=h, minute=m, second=0, microsecond=0)
    last = parse_dt(st.get("last_sent_at"))
    today = local.date().isoformat()
    if not (at <= local < at + SEND_WINDOW) or st.get("last_attempt") == today or (
            last and last.astimezone(tz()).date() == local.date()):
        return None
    db.col("state").update_one({"_id": "caregiver"}, {"$set": {"last_attempt": today}})  # once a day, sent or not
    try:
        return send()
    except ApiError as exc:
        log.info("daily caregiver summary skipped: %s", exc.message)
        return None
