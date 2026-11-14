"""Action loop for one action (T0-7): follow-up email. Propose -> confirm (send or draft) -> receipt -> undo.

Undo really works: a confirmed send is held until the undo window (ACTION_UNDO_SECONDS, default 30)
closes, then delivered; undo inside the window cancels it. With EMAIL_DRY_RUN=true (default) a send
request saves a draft instead (status draft_saved), as the root .env.example specifies."""
import logging
import re
import threading
from datetime import timedelta

from core import contract, db, events, receipts, tiger
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
    first = re.sub(r"[^a-z]", "", person["name"].split()[0].lower()) or "contact"
    company = re.sub(r"[^a-z0-9]", "", (person.get("company") or "").lower())
    return f"{first}@{company}.example" if company else ""


def _publish(doc: dict):
    events.publish("action.updated", contract.action(doc))


def _set(action_id: str, **fields) -> dict:
    db.col("actions").update_one({"_id": action_id}, {"$set": fields})
    doc = db.col("actions").find_one({"_id": action_id})
    tiger.log_action(tiger.USER, now(), action_id, fields.get("status", "updated"), "user")
    return doc


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
    doc = {"_id": new_id("act"), "type": "follow_up_email", "status": "proposed", "person_id": person_id,
           "draft": draft, "source_moment_ids": ids, "created_at": now()}
    db.col("actions").insert_one(doc)
    tiger.log_action(tiger.USER, now(), doc["_id"], "proposed", "cortex", {"type": "follow_up_email"})
    events.publish("action.proposed", contract.action(doc))
    return contract.action(doc)


def auto_propose(person_id: str):
    """Called after a promise is confirmed (demo beat 5: Cortex proposes the follow-up)."""
    try:
        propose(person_id)
    except ApiError as exc:
        log.info("auto-propose skipped: %s", exc.message)


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
            log.error("follow-up delivery failed: %s", exc)
            _publish(_set(action_id, status="failed", error=str(exc)[:300]))
            receipts.create("action", f"Could not send the follow-up email: {exc}", doc["source_moment_ids"], action_id)

    t = threading.Timer(settings.undo_seconds, fire)
    t.daemon = True
    _timers[action_id] = t
    t.start()


def confirm(action_id: str, deliver: str, draft_edits: dict | None) -> dict:
    from actions import email

    doc = db.col("actions").find_one({"_id": action_id})
    if not doc:
        raise not_found("action")
    if doc["status"] != "proposed":
        raise ApiError(409, "not_proposed", f"Action is {doc['status']}, not proposed.")
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


def undo(action_id: str) -> dict:
    doc = db.col("actions").find_one({"_id": action_id})
    if not doc:
        raise not_found("action")
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
