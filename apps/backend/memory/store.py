"""Moments, privacy state and modes in MongoDB; Tiger Data keeps the time index."""
import json
from datetime import datetime

from core import contract, db, events, tiger
from core.config import REPO_ROOT
from core.timeutil import now, parse_dt

# ---------- moments ----------


def get_moment(moment_id: str) -> dict | None:
    return db.col("moments").find_one({"_id": moment_id})


def list_moments(since: datetime | None = None, limit: int = 50) -> list[dict]:
    q = {"ts": {"$gte": since}} if since else {}
    docs = db.col("moments").find(q, {"embedding": 0}).sort("ts", -1).limit(limit)
    return [contract.moment(d) for d in docs]


def moments_for_person(person_id: str, limit: int = 20) -> list[dict]:
    return list(db.col("moments").find({"person_ids": person_id}, {"embedding": 0}).sort("ts", 1).limit(limit))


def moments_by_ids(ids: list[str]) -> list[dict]:
    docs = {d["_id"]: d for d in db.col("moments").find({"_id": {"$in": list(ids)}}, {"embedding": 0})}
    return [docs[i] for i in ids if i in docs]


def insert_moment(doc: dict):
    db.col("moments").insert_one(doc)
    tiger.log_timeline(doc)


# ---------- privacy ----------


def privacy() -> dict:
    doc = db.col("state").find_one({"_id": "privacy"})
    if not doc:
        doc = {"_id": "privacy", "state": "capturing", "since": now()}
        db.col("state").insert_one(doc)
    return doc


def set_privacy(state: str) -> dict:
    current = privacy()
    if current["state"] != state:
        db.col("state").update_one({"_id": "privacy"}, {"$set": {"state": state, "since": now()}})
        tiger.log_action(tiger.USER, now(), None, f"privacy.{state}", "user")
    out = privacy_out()
    events.publish("privacy.changed", out)
    return out


def privacy_out() -> dict:
    from core.timeutil import iso

    p = privacy()
    return {"state": p["state"], "since": iso(p["since"])}


# ---------- modes ----------


def ensure_modes():
    if db.col("modes").count_documents({}) == 0:
        for m in json.loads((REPO_ROOT / "fixtures" / "modes.json").read_text()):
            db.col("modes").insert_one({"_id": m.pop("id"), **m})


def list_modes() -> list[dict]:
    ensure_modes()
    order = {"focus": 0, "student": 1, "life": 2, "assist": 3}
    return sorted((contract.mode(d) for d in db.col("modes").find()), key=lambda m: order.get(m["id"], 9))


def set_active_mode(mode_id: str) -> dict | None:
    """POST /modes/{id}/activate: exactly one mode is active. Returns the mode, or None if unknown."""
    ensure_modes()
    if not db.col("modes").find_one({"_id": mode_id}):
        return None
    db.col("modes").update_many({}, {"$set": {"active": False}})
    db.col("modes").update_one({"_id": mode_id}, {"$set": {"active": True}})
    return contract.mode(db.col("modes").find_one({"_id": mode_id}))


def active_mode() -> str:
    ensure_modes()
    doc = db.col("modes").find_one({"active": True})
    return doc["_id"] if doc else "focus"


def as_dt(value) -> datetime | None:
    return parse_dt(value)
