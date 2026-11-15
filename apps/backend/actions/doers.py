"""The non-email actions: calendar_event (ACT-5), reminder (ACT-6), flashcards and notes (ACT-7),
message (ACT-9) and read_aloud. Same loop as the follow-up email: propose -> confirm -> receipt -> undo.

Google types run at confirm time and undo removes what they made (event and task deleted, doc moved
to Drive's trash). With no Google token they are a dry run: status done, external null. A text is
held until the undo window closes, then sent through Chert; undo inside the window cancels it."""
import logging
import threading
from datetime import timedelta

from actions import chert, google
from core import contract, db, events, receipts, tiger
from core.config import settings
from core.errors import ApiError, not_found
from core.ids import new_id
from core.timeutil import now
from memory import store

log = logging.getLogger(__name__)
_timers: dict[str, threading.Timer] = {}

TYPES = {"calendar_event", "reminder", "flashcards", "notes", "message", "read_aloud"}
GOOGLE_TYPES = {"calendar_event", "reminder", "flashcards", "notes"}
DEFAULT_MODE = {"calendar_event": "focus", "reminder": "life", "flashcards": "student", "notes": "student",
                "message": "life", "read_aloud": "assist"}
PAYLOAD = {"calendar_event": "event", "reminder": "task", "flashcards": "doc", "notes": "doc", "message": "message"}
DONE = {"calendar_event": "Added “{t}” to your Google Calendar.", "reminder": "Added “{t}” to your Google Tasks.",
        "flashcards": "Saved the flashcards “{t}” to your Google Drive.", "notes": "Saved the notes “{t}” to your Google Drive.",
        "read_aloud": "Reading “{t}” aloud."}
UNDONE = {"calendar_event": "Removed “{t}” from your calendar.", "reminder": "Removed the task “{t}”.",
          "flashcards": "Moved the flashcards “{t}” to Drive's trash.", "notes": "Moved the notes “{t}” to Drive's trash.",
          "read_aloud": "Stopped reading “{t}”.", "message": "Cancelled the text to {to}."}


def _set(action_id: str, **fields) -> dict:
    db.col("actions").update_one({"_id": action_id}, {"$set": fields})
    doc = db.col("actions").find_one({"_id": action_id})
    tiger.log_action(tiger.USER, now(), action_id, fields.get("status", "updated"), "user")
    events.publish("action.updated", contract.action(doc))
    return doc


def propose(body: dict) -> dict:
    kind = body["type"]
    payload_in = body.get(PAYLOAD.get(kind, ""), None) or {}
    title = (body.get("title") or payload_in.get("title") or
             (f"Text {payload_in['to']}" if kind == "message" and payload_in.get("to") else "")).strip()
    if not title:
        raise ApiError(400, "bad_request", f"title is required for {kind}.")
    ids = [i for i in (body.get("source_moment_ids") or []) if store.get_moment(i)]
    if not ids:
        raise ApiError(400, "bad_request", "source_moment_ids must name at least one stored moment.")
    doc = {"_id": new_id("act"), "type": kind, "status": "proposed", "mode": body.get("mode") or DEFAULT_MODE[kind],
           "title": title, "person_id": body.get("person_id"), "source_moment_ids": ids, "created_at": now()}
    if body.get("summary"):
        doc["summary"] = body["summary"].strip()
    key = PAYLOAD.get(kind)
    payload = body.get(key) if key else None
    if kind == "calendar_event" and not payload:
        raise ApiError(400, "bad_request", "event (title, start, end) is required for calendar_event.")
    if kind == "message" and not payload:
        raise ApiError(400, "bad_request", "message (to, text) is required for message.")
    if kind == "reminder" and not payload:
        payload = {"title": title, "notes": doc.get("summary"), "due": None}
    if kind in {"flashcards", "notes"} and not payload:
        payload = {"title": title, "body": doc.get("summary") or title}
    if key:
        doc[key] = payload
    db.col("actions").insert_one(doc)
    tiger.log_action(tiger.USER, now(), doc["_id"], "proposed", "cortex", {"type": kind})
    events.publish("action.proposed", contract.action(doc))
    return contract.action(doc)


def _send_later(action_id: str):
    def fire():
        _timers.pop(action_id, None)
        doc = db.col("actions").find_one({"_id": action_id})
        if not doc or doc["status"] != "sent":
            return
        try:
            msg_id = chert.send(doc["message"]["to"], doc["message"]["text"], action_id)
            db.col("actions").update_one({"_id": action_id}, {"$set": {
                "external": {"provider": "chert", "id": msg_id, "url": None}}})
            receipts.close_undo(action_id)
        except Exception as exc:  # noqa: BLE001
            log.error("text delivery failed: %s", exc)
            _set(action_id, status="failed", error=str(exc)[:300])
            receipts.close_undo(action_id)
            receipts.create("action", f"Could not send the text to {doc['message']['to']}: {exc}",
                            doc["source_moment_ids"], action_id)

    t = threading.Timer(settings.undo_seconds, fire)
    t.daemon = True
    _timers[action_id] = t
    t.start()


def confirm(doc: dict, deliver: str, google_token: str | None) -> dict:
    kind, action_id, title = doc["type"], doc["_id"], doc["title"]
    until = now() + timedelta(seconds=settings.undo_seconds)

    if kind == "message":
        if deliver not in {"send", "do"}:
            raise ApiError(400, "bad_request", "A message is confirmed with deliver: send.")
        to = doc["message"]["to"]
        if chert.can_send():
            doc = _set(action_id, status="sent", confirmed_at=now())
            _send_later(action_id)
            summary = f"Texting {to} from the Cortex line in {settings.undo_seconds} seconds: “{doc['message']['text'][:80]}”."
        else:
            doc = _set(action_id, status="draft_saved", confirmed_at=now(), external=None)
            summary = f"Saved the text to {to} as a draft. (Dry run: texting is off.)"
        rcp = receipts.create("action", summary, doc["source_moment_ids"], action_id, undo_until=until)
        return {"action": contract.action(doc), "receipt": rcp}

    if deliver != "do":
        raise ApiError(400, "bad_request", f"{kind} is confirmed with deliver: do.")
    summary = DONE[kind].format(t=title)
    external = None
    if kind in GOOGLE_TYPES:
        try:
            token = google.resolve_token(google_token)
            if token:
                if kind == "calendar_event":
                    external = google.create_event(token, doc["event"])
                elif kind == "reminder":
                    external = google.create_task(token, doc["task"])
                else:
                    external = google.create_doc(token, doc["doc"]["title"], doc["doc"]["body"])
            else:
                summary += " (Dry run: Google isn't connected.)"
        except google.GoogleError as exc:
            doc = _set(action_id, status="failed", error=str(exc)[:300])
            rcp = receipts.create("action", f"Could not finish “{title}”: {exc}", doc["source_moment_ids"], action_id)
            return {"action": contract.action(doc), "receipt": rcp}
    doc = _set(action_id, status="done", confirmed_at=now(), external=external)
    rcp = receipts.create("action", summary, doc["source_moment_ids"], action_id, undo_until=until)
    return {"action": contract.action(doc), "receipt": rcp}


def undo(doc: dict, google_token: str | None) -> dict:
    kind, action_id = doc["type"], doc["_id"]
    if doc["status"] not in {"done", "sent", "draft_saved"}:
        raise ApiError(409, "not_undoable", f"Action is {doc['status']}.")
    open_rcp = db.col("receipts").find_one({"action_id": action_id, "undo.available": True})
    if not open_rcp or (open_rcp["undo"].get("until") and open_rcp["undo"]["until"] < now()):
        raise ApiError(409, "undo_expired", "The undo window has closed.")
    timer = _timers.pop(action_id, None)
    if timer:
        timer.cancel()
    ext = doc.get("external")
    if ext and ext["provider"].startswith("google_"):
        token = google.resolve_token(google_token)
        if not token:
            raise ApiError(409, "not_undoable", "Sign in with Google again to undo this.")
        try:
            {"google_calendar": google.delete_event, "google_tasks": google.delete_task,
             "google_drive": google.trash_file}[ext["provider"]](token, ext["id"])
        except google.GoogleError as exc:
            raise ApiError(502, "undo_failed", str(exc)) from exc
    receipts.close_undo(action_id)
    doc = _set(action_id, status="undone", undone_at=now())
    summary = UNDONE[kind].format(t=doc.get("title", ""), to=(doc.get("message") or {}).get("to", ""))
    rcp = receipts.create("action", summary, doc["source_moment_ids"], action_id)
    return {"action": contract.action(doc), "receipt": rcp}


def get(action_id: str) -> dict:
    doc = db.col("actions").find_one({"_id": action_id})
    if not doc:
        raise not_found("action")
    return doc
