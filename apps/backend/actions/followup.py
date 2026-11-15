"""Action loop for one action (D-7): follow-up email. Propose -> confirm (send or draft) -> receipt -> undo.

Undo really works: a confirmed send is held until the undo window (ACTION_UNDO_SECONDS, default 30)
closes, then delivered; undo inside the window cancels it. With EMAIL_DRY_RUN=true (default) a send
request saves a draft instead (status draft_saved), as the root .env.example specifies."""
import logging
import re
import threading
from datetime import timedelta

from core import contract, db, events, receipts, tiger, user
from core.config import settings
from core.errors import ApiError, not_found
from core.ids import new_id
from core.llm import get_llm
from core.timeutil import now
from memory import store
from skills import network, promises
from skills.brief import promise_line

log = logging.getLogger(__name__)
_timers: dict[str, threading.Timer] = {}


def _guess_email(person: dict) -> str:
    if settings.followup_email_to:  # demo hardcode: one inbox we control receives every follow-up
        return settings.followup_email_to
    first = re.sub(r"[^a-z]", "", person["name"].split()[0].lower()) or "contact"
    company = re.sub(r"[^a-z0-9]", "", (person.get("company") or "").lower())
    return f"{first}@{company}.example" if company else ""


def _publish(doc: dict):
    events.publish("action.updated", contract.action(doc))


def _set(action_id: str, **fields) -> dict:
    db.col("actions").update_one({"_id": action_id}, {"$set": fields})
    doc = db.col("actions").find_one({"_id": action_id})
    tiger.log_action(tiger.user(), now(), action_id, fields.get("status", "updated"), "user")
    return doc


def list_actions(status: str | None = None, mode: str | None = None, limit: int = 100) -> list[dict]:
    """GET /actions (#40, #45): newest first, optionally filtered by status and mode."""
    query = {k: v for k, v in {"status": status, "mode": mode}.items() if v}
    return [contract.action(d) for d in db.col("actions").find(query).sort("created_at", -1).limit(limit)]


def propose(person_id: str, source_moment_ids: list[str] | None = None) -> dict:
    person = network.get(person_id)
    existing = db.col("actions").find_one({"person_id": person_id, "status": "proposed"})
    if existing:
        return contract.action(existing)

    from skills.ask import moments_block

    open_p = promises.open_for(person_id)
    ids = [i for i in (source_moment_ids or []) if store.get_moment(i)]
    if not ids:
        ids = [person["introduced_moment_id"], *[p["source_moment_id"] for p in open_p]]
        ids = [i for i in dict.fromkeys(ids) if store.get_moment(i)]
    if not ids:
        raise ApiError(400, "bad_request", "No source moments found for this person.")

    company = f" ({person['company']})" if person.get("company") else ""
    data = get_llm().follow_up(name=person["name"], company=company,
                               moments=moments_block(store.moments_by_ids(ids)),
                               promises="\n".join(f"- {promise_line(p, person)}" for p in open_p) or "(none)")
    first = person["name"].split()[0]
    draft = {
        "to": _guess_email(person),
        "subject": (data.get("subject") or f"Great meeting you, {first}").strip(),
        "body": (data.get("body") or f"Hi {first},\n\nGreat meeting you today. Talk soon.").strip(),
    }
    doc = {"_id": new_id("act"), "type": "follow_up_email", "status": "proposed", "mode": "focus",
           "title": f"Draft a follow-up to {first}", "person_id": person_id, "draft": draft,
           "source_moment_ids": ids, "created_at": now()}
    db.col("actions").insert_one(doc)
    tiger.log_action(tiger.user(), now(), doc["_id"], "proposed", "cortex", {"type": "follow_up_email"})
    events.publish("action.proposed", contract.action(doc))
    return contract.action(doc)


def auto_propose(person_id: str):
    """Called after a promise is confirmed (demo beat 5: Cortex proposes the follow-up)."""
    try:
        propose(person_id)
    except ApiError as exc:
        log.info("auto-propose skipped: %s", exc.message)


def _deliver(action_id: str):
    """Send a confirmed email whose undo window has closed. Safe to call twice: delivered_at guards it."""
    _timers.pop(action_id, None)
    doc = db.col("actions").find_one({"_id": action_id})
    if not doc or doc["status"] != "sent" or doc.get("delivered_at"):
        return
    try:
        from actions import email

        email.send(doc["draft"]["to"], doc["draft"]["subject"], doc["draft"]["body"])
        db.col("actions").update_one({"_id": action_id}, {"$set": {"delivered_at": now()}})
        receipts.close_undo(action_id)
    except Exception as exc:  # noqa: BLE001
        log.error("follow-up delivery failed: %s", exc)
        receipts.close_undo(action_id)
        _publish(_set(action_id, status="failed", error=str(exc)[:300]))
        receipts.create("action", f"Could not send the follow-up email: {exc}", doc["source_moment_ids"], action_id)


def _deliver_later(action_id: str):
    t = threading.Timer(settings.undo_seconds, user.carry(_deliver), args=(action_id,))  # keeps the request's user
    t.daemon = True
    _timers[action_id] = t
    t.start()


def sweep_held() -> int:
    """Deliver held emails and texts whose undo window closed while no timer was running (a restart or
    redeploy lost it). Called by the ticker for each user this process has served. Returns how many it sent."""
    from actions import doers

    done = 0
    for doc in db.col("actions").find({"status": "sent", "type": {"$in": ["follow_up_email", "message"]},
                                        "delivered_at": {"$exists": False}}):
        aid = doc["_id"]
        if aid in _timers or aid in doers._timers:
            continue  # its timer is still running
        rcp = db.col("receipts").find_one({"action_id": aid, "undo.available": True})
        if not rcp or (rcp["undo"].get("until") and rcp["undo"]["until"] > now()):
            continue  # undone or already closed, or still inside the window
        (_deliver if doc["type"] == "follow_up_email" else doers._send)(aid)
        done += 1
    return done


def dismiss(action_id: str) -> dict:
    """ACT-11: skip a proposal. Nothing runs; the action becomes dismissed and a receipt records it."""
    doc = db.col("actions").find_one({"_id": action_id})
    if not doc:
        raise not_found("action")
    if doc["status"] not in {"proposed", "failed"}:
        raise ApiError(409, "not_proposed", f"Action is {doc['status']}, so it can't be skipped.")
    doc = _set(action_id, status="dismissed", dismissed_at=now())
    _publish(doc)
    rcp = receipts.create("action", f"Skipped “{doc.get('title') or doc['type']}”. Nothing was done.",
                          doc["source_moment_ids"], action_id)
    return {"action": contract.action(doc), "receipt": rcp}


_E164 = re.compile(r"^\+[1-9][0-9]{6,14}$")
_TITLE_OF = {"event": "event", "task": "task", "doc": "doc"}  # payload keys whose title is also the card title


def _apply_edits(doc: dict, edits: dict) -> dict:
    """The user's changes in the edit sheet, applied before anything runs. Only the payload this type carries."""
    from datetime import datetime

    key = {"calendar_event": "event", "reminder": "task", "flashcards": "doc", "notes": "doc",
           "message": "message", "expense": "expense"}.get(doc["type"])
    patch = {k: (v.strip() if isinstance(v, str) else v) for k, v in (edits.get(key) or {}).items()}
    patch = {k: v for k, v in patch.items() if v not in ("", None) or k in {"location", "description", "notes"}}
    if not key or not patch:
        return doc
    merged = {**(doc.get(key) or {}), **patch}
    if key == "message" and not _E164.match(merged.get("to", "")):
        raise ApiError(400, "bad_request", "A text needs a phone number like +15555550123.")
    if key == "message" and not merged.get("text"):
        raise ApiError(400, "bad_request", "The text can't be empty.")
    if key == "event":
        try:
            start, end = datetime.fromisoformat(merged["start"]), datetime.fromisoformat(merged["end"])
        except (KeyError, ValueError) as exc:
            raise ApiError(400, "bad_request", "The event needs a start and end time.") from exc
        if (start.tzinfo is None) != (end.tzinfo is None) or end <= start:
            raise ApiError(400, "bad_request", "The event must end after it starts.")
    if key == "expense":
        amount = merged.get("amount")
        if amount is not None and (not isinstance(amount, (int, float)) or amount < 0):
            raise ApiError(400, "bad_request", "The amount must be a number of dollars, 0 or more.")
        if not merged.get("label"):
            raise ApiError(400, "bad_request", "The expense needs a label.")
    if key == "task" and merged.get("due"):
        try:
            datetime.fromisoformat(str(merged["due"])[:10])
        except ValueError as exc:
            raise ApiError(400, "bad_request", "The due date must look like 2026-11-20.") from exc
    fields = {key: merged}
    if key == "expense":
        from actions import doers

        fields["title"] = doers.expense_title(merged)
    if key in _TITLE_OF and patch.get("title"):
        fields["title"] = patch["title"]
    db.col("actions").update_one({"_id": doc["_id"]}, {"$set": fields})
    return db.col("actions").find_one({"_id": doc["_id"]})


def confirm(action_id: str, deliver: str, draft_edits: dict | None, google_token: str | None = None,
            edits: dict | None = None) -> dict:
    from actions import doers, email

    doc = db.col("actions").find_one({"_id": action_id})
    if not doc:
        raise not_found("action")
    if doc["status"] not in {"proposed", "failed"}:  # failed can be retried: the user's yes still stands
        raise ApiError(409, "not_proposed", f"Action is {doc['status']}, not proposed.")
    if doc["status"] == "failed":
        db.col("actions").update_one({"_id": action_id}, {"$unset": {"error": ""}})
    if doc["type"] != "follow_up_email":
        return doers.confirm(_apply_edits(doc, edits or {}), deliver, google_token)
    if deliver not in {"send", "draft"}:
        raise ApiError(400, "bad_request", "A follow-up email is confirmed with deliver: send or draft.")
    draft = {**doc["draft"], **{k: v for k, v in (draft_edits or {}).items() if k in {"to", "subject", "body"} and v is not None}}
    person = network.get(doc["person_id"])
    who = f"{person['name']}" + (f" ({person['company']})" if person.get("company") else "")
    until = now() + timedelta(seconds=settings.undo_seconds)

    if deliver == "send" and email.can_send():
        if not draft["to"]:
            raise ApiError(400, "bad_request", "draft.to is required to send.")
        doc = _set(action_id, status="sent", draft=draft, confirmed_at=now())
        _deliver_later(action_id)
        summary = f"Sent follow-up email to {who}."
    else:
        db.col("drafts").insert_one({"_id": new_id("drf"), "action_id": action_id, **draft, "created_at": now()})
        doc = _set(action_id, status="draft_saved", draft=draft, confirmed_at=now())
        summary = f"Saved follow-up email to {who} as a draft." + (
            " (Dry run: sending is off.)" if deliver == "send" else "")
    _publish(doc)
    rcp = receipts.create("action", summary, doc["source_moment_ids"], action_id, undo_until=until)
    return {"action": contract.action(doc), "receipt": rcp}


def undo(action_id: str, google_token: str | None = None) -> dict:
    from actions import doers

    doc = db.col("actions").find_one({"_id": action_id})
    if not doc:
        raise not_found("action")
    if doc["type"] == "caregiver_summary":
        from skills import caregiver

        return caregiver.undo(doc)
    if doc["type"] != "follow_up_email":
        return doers.undo(doc, google_token)
    if doc["status"] not in {"sent", "draft_saved"}:
        raise ApiError(409, "not_undoable", f"Action is {doc['status']}.")
    open_rcp = db.col("receipts").find_one({"action_id": action_id, "undo.available": True})
    if not open_rcp or (open_rcp["undo"].get("until") and open_rcp["undo"]["until"] < now()):
        raise ApiError(409, "undo_expired", "The undo window has closed.")
    timer = _timers.pop(action_id, None)
    if timer:
        timer.cancel()
    db.col("drafts").delete_many({"action_id": action_id})
    receipts.close_undo(action_id)
    doc = _set(action_id, status="undone", undone_at=now())
    _publish(doc)
    person = network.get(doc["person_id"])
    what = "sending" if doc.get("draft") and open_rcp["summary"].startswith("Sent") else "the draft"
    rcp = receipts.create("action", f"Undid {what} of the follow-up email to {person['name']}.",
                          doc["source_moment_ids"], action_id)
    return {"action": contract.action(doc), "receipt": rcp}
