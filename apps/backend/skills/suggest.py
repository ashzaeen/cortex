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
KINDS = {"calendar_event", "reminder", "notes"}


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
    else:
        text = (it.get("body") or "").strip()
        if not text:
            return None
        body["doc"] = {"title": title, "body": text}
        body["summary"] = "Save these notes to your Google Drive."
    return body


def from_perception(items: list[dict] | None, moment: dict) -> list[dict]:
    created = []
    for it in (items or [])[:2]:
        body = _body(it if isinstance(it, dict) else {}, moment)
        if not body:
            continue
        dup = db.col("actions").find_one({"type": body["type"], "status": "proposed",
                                          "title": {"$regex": f"^{re.escape(body['title'])}$", "$options": "i"}})
        if dup:
            continue
        try:
            created.append(doers.propose(body))
        except ApiError as exc:
            log.info("suggestion skipped: %s", exc.message)
    return created
