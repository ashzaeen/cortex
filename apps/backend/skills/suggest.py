"""Suggested actions from perception (ACT-5 calendar, ACT-6 reminder, ACT-7 notes).

Perception may return up to two suggestions per moment. Each becomes a proposed action in the
moment's mode; nothing runs until the wearer approves it. Texts are never suggested here (the
backend knows no phone numbers). The same open suggestion is never proposed twice."""
import logging
import re
from datetime import date, datetime, timedelta

from actions import doers
from core import db
from core.errors import ApiError
from core.timeutil import tz

log = logging.getLogger(__name__)
KINDS = {"calendar_event", "reminder", "notes", "flashcards", "expense"}
_DEADLINE = re.compile(r"^due:\s*(.+)$", re.I)


def _local(value: str | None) -> datetime | None:
    try:
        dt = datetime.fromisoformat((value or "").strip())
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=tz())


def _date(value: str | None) -> str | None:
    try:
        return date.fromisoformat((value or "").strip()[:10]).isoformat()
    except ValueError:
        return None


def _body(it: dict, moment: dict) -> dict | None:
    kind, title = it.get("type"), (it.get("title") or "").strip()[:120]
    if kind not in KINDS or not title or float(it.get("confidence") or 0.6) < 0.6:
        return None
    body = {"type": kind, "title": title, "mode": moment.get("mode"), "source_moment_ids": [moment["_id"]],
            "person_id": (moment.get("person_ids") or [None])[0]}
    if kind == "calendar_event":
        start = _local(it.get("start"))
        if not start:
            return None
        end = _local(it.get("end"))
        end = end if end and end > start else start + timedelta(hours=1)
        body["event"] = {"title": title, "start": start.isoformat(), "end": end.isoformat(),
                         "location": it.get("location") or None, "description": None}
        when = f"{start:%a %b} {start.day} at {start.hour % 12 or 12}:{start:%M} {'PM' if start.hour >= 12 else 'AM'}"
        body["summary"] = f"Add {title} to your calendar on {when}."
    elif kind == "reminder":
        due = _date(it.get("due_date"))
        body["task"] = {"title": title, "notes": None, "due": due}
        body["summary"] = f"A Google Tasks reminder to {title[0].lower() + title[1:]}" + (f", due {due}." if due else ".")
    elif kind == "expense":
        try:
            amount = round(float(it.get("amount")), 2)
        except (TypeError, ValueError):
            return None
        if amount < 0:
            return None
        body["expense"] = {"label": title, "amount": amount}
        body["title"] = doers.expense_title(body["expense"])
        body["summary"] = f"Log {doers.money(amount)} for {title} to your expenses."
    else:
        text = (it.get("body") or "").strip()
        if not text:
            return None
        body["doc"] = {"title": title, "body": text}
        body["summary"] = "Save these flashcards to your Google Drive." if kind == "flashcards" else \
            "Save these notes to your Google Drive."
    return body


def study_block(deadline: dict) -> dict | None:
    """STU-5: a study hour the evening before a caught deadline ("Due: Quiz" -> "Study for Quiz")."""
    m = _DEADLINE.match(deadline.get("title") or "")
    start = _local((deadline.get("event") or {}).get("start"))
    if not m or not start:
        return None
    block = (start - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
    if block <= datetime.now(tz()):
        return None
    title = f"Study for {m.group(1).strip()}"
    return {"type": "calendar_event", "title": title, "mode": deadline.get("mode"),
            "source_moment_ids": deadline["source_moment_ids"], "person_id": None,
            "event": {"title": title, "start": block.isoformat(), "end": (block + timedelta(hours=1)).isoformat(),
                      "location": None, "description": f"Before: {m.group(1).strip()}"},
            "summary": f"Block an hour on {block:%a %b} {block.day} at 6:00 PM to study for {m.group(1).strip()}."}


def _auto_run(proposed: dict, google_token: str | None) -> dict:
    """ACT-4: a low-risk suggestion the mode runs without asking. Same path as a tap on Approve, so it is
    receipted and undoable; it just carries auto=true so the recap and Actions can say Cortex did it."""
    from actions import followup

    db.col("actions").update_one({"_id": proposed["id"]}, {"$set": {"auto": True}})
    try:
        return followup.confirm(proposed["id"], "do", None, google_token)["action"]
    except ApiError as exc:
        log.info("auto-run skipped, left for approval: %s", exc.message)
        return proposed


def from_perception(items: list[dict] | None, moment: dict, google_token: str | None = None) -> list[dict]:
    """Automatic suggestions only: each must be an action the moment's mode may suggest (MODE-1).
    A suggestion the mode lists in auto_run (reminder, notes, flashcards) is carried out at once (ACT-4)."""
    from skills import modes
    from skills import modes as modes_skill

    created = []
    for it in (items or [])[:2]:
        body = _body(it if isinstance(it, dict) else {}, moment)
        if not body or not modes.allows(body["type"], moment.get("mode")):
            continue
        if body["type"] == "expense" and db.col("actions").find_one(
                {"type": "expense", "source_moment_ids": moment["_id"], "status": {"$ne": "dismissed"}}):
            continue  # "log this receipt" already logged it from this moment
        dup = db.col("actions").find_one({"type": body["type"], "status": "proposed",
                                          "title": {"$regex": f"^{re.escape(body['title'])}$", "$options": "i"}})
        if dup:
            continue
        try:
            made = doers.propose(body)
            if modes_skill.auto_runs(made["type"], moment.get("mode")):
                made = _auto_run(made, google_token)
            created.append(made)
        except ApiError as exc:
            log.info("suggestion skipped: %s", exc.message)
            continue
        block = study_block(created[-1]) if moment.get("mode") == "student" and body["type"] == "calendar_event" else None
        if block and not db.col("actions").find_one({"type": "calendar_event", "status": "proposed", "title": block["title"]}):
            try:
                created.append(doers.propose(block))
            except ApiError as exc:
                log.info("study block skipped: %s", exc.message)
    return created
