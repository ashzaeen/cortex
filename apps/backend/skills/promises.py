"""Waiting-on tracker (D-4): a spoken promise becomes a proposed item (confirm chip) with who, what, due.
One tap confirms it. Vague dates keep date=null and the words in due.text, never a guessed deadline."""
import re
from datetime import date, timedelta

from core import background, contract, db, events, tiger
from core.errors import ApiError, not_found
from core.ids import new_id
from core.llm_mock import DAYS
from core.timeutil import now, tz
from skills import network


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def parse_due(text: str | None, date_hint: str | None = None, inferred: bool = False) -> dict:
    # Weekdays, tomorrow and today are resolved here, not by the model: it does not know today's date.
    low = (text or "").lower()
    today = now().astimezone(tz()).date()
    relative = any(re.search(rf"\b{d}\b", low) for d in DAYS) or any(w in low for w in ("tomorrow", "today", "tonight"))
    if date_hint and not relative:
        try:
            date.fromisoformat(date_hint)
            return {"date": date_hint, "inferred": bool(inferred), "text": text}
        except ValueError:
            pass
    day = next((d for d in DAYS if re.search(rf"\b{d}\b", low)), None)
    if day:
        delta = (DAYS.index(day) - today.weekday()) % 7 or 7
        return {"date": (today + timedelta(days=delta)).isoformat(), "inferred": False, "text": text}
    if "tomorrow" in low:
        return {"date": (today + timedelta(days=1)).isoformat(), "inferred": False, "text": text}
    if "today" in low or "tonight" in low:
        return {"date": today.isoformat(), "inferred": False, "text": text}
    return {"date": None, "inferred": False, "text": text}


def _insert(direction: str, person_id: str, what: str, due: dict, source_moment_id: str) -> dict | None:
    for p in db.col("promises").find({"person_id": person_id, "status": {"$in": ["proposed", "confirmed"]}}):
        if _norm(p["what"]) == _norm(what):
            return None  # already tracked
    doc = {"_id": new_id("prm"), "direction": direction, "person_id": person_id, "what": what.strip()[:200],
           "due": due, "status": "proposed", "source_moment_id": source_moment_id, "created_at": now()}
    db.col("promises").insert_one(doc)
    out = contract.promise(doc)
    events.publish("promise.proposed", out)
    tiger.log_action(tiger.user(), now(), None, "promise.proposed", "cortex", {"promise_id": doc["_id"]})
    return doc


def from_perception(items: list[dict], moment: dict, default_person: dict | None) -> list[dict]:
    created = []
    for it in items or []:
        what = (it.get("what") or "").strip()
        if not what or float(it.get("confidence") or 0.6) < 0.5:
            continue
        person = network.find_by_name(it.get("person_name")) or default_person
        if not person:
            continue  # the schema needs a person; without one there is nothing to track against
        direction = it.get("direction") if it.get("direction") in ("waiting_on", "i_owe") else "waiting_on"
        due = parse_due(it.get("due_text"), it.get("due_date"), it.get("due_inferred", False))
        doc = _insert(direction, person["_id"], what, due, moment["_id"])
        if doc:
            created.append(doc)
            if person["_id"] not in moment.get("person_ids", []):
                db.col("moments").update_one({"_id": moment["_id"]}, {"$addToSet": {"person_ids": person["_id"]}})
    return created


def create(body: dict) -> dict:
    network.get(body["person_id"])
    if not db.col("moments").find_one({"_id": body["source_moment_id"]}):
        raise ApiError(400, "bad_request", "source_moment_id does not exist.")
    doc = _insert(body["direction"], body["person_id"], body["what"], parse_due(body.get("due_text")),
                  body["source_moment_id"])
    if not doc:
        raise ApiError(409, "duplicate", "That promise is already tracked.")
    return contract.promise(doc)


def confirm(promise_id: str) -> dict:
    p = db.col("promises").find_one({"_id": promise_id})
    if not p:
        raise not_found("promise")
    if p["status"] != "confirmed":
        db.col("promises").update_one({"_id": promise_id}, {"$set": {"status": "confirmed", "confirmed_at": now()}})
        p = db.col("promises").find_one({"_id": promise_id})
        events.publish("promise.confirmed", contract.promise(p))
        tiger.log_action(tiger.user(), now(), None, "promise.confirmed", "user", {"promise_id": promise_id})
        # Demo beat 5: Cortex proposes the follow-up email for the person who made the promise
        from actions import followup

        background.run(followup.auto_propose, p["person_id"])
        from skills import brief

        background.run(brief.prewarm, p["person_id"])  # the brief now lists this promise as open
    return contract.promise(p)






def open_for(person_id: str) -> list[dict]:
    return list(db.col("promises").find({"person_id": person_id, "status": {"$in": ["proposed", "confirmed"]}})
                .sort("created_at", 1))


def list_filtered(status: str | None, direction: str | None, person_id: str | None) -> list[dict]:
    q = {}
    if status:
        q["status"] = status
    if direction:
        q["direction"] = direction
    if person_id:
        q["person_id"] = person_id
    return [contract.promise(p) for p in db.col("promises").find(q).sort("created_at", -1)]


def complete(promise_id: str) -> dict:
    """WAI-7 close out: "got it" or a done tap. Only a confirmed promise can be done; undo is re-adding it."""
    p = db.col("promises").find_one({"_id": promise_id})
    if not p:
        raise not_found("promise")
    if p["status"] == "proposed":
        raise ApiError(409, "not_confirmed", "Confirm the promise first, or dismiss it.")
    if p["status"] != "done":
        db.col("promises").update_one({"_id": promise_id}, {"$set": {"status": "done", "done_at": now()}})
        p = db.col("promises").find_one({"_id": promise_id})
        tiger.log_action(tiger.user(), now(), None, "promise.done", "user", {"promise_id": promise_id})
    return contract.promise(p)


def dismiss(promise_id: str) -> dict:
    p = db.col("promises").find_one({"_id": promise_id})
    if not p:
        raise not_found("promise")
    db.col("promises").update_one({"_id": promise_id}, {"$set": {"status": "dismissed"}})
    return contract.promise({**p, "status": "dismissed"})
