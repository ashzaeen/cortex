"""Shared helpers for the skills (SKL-4 to SKL-8): settings, picking the view, saving a moment.

The view comes from one of three places, in this order: the snapshot sent with the request (the device camera or
an upload), a named moment, or the latest glasses frame (source "glasses"). Asking for the glasses when none are
streaming is a 409 `no_glasses` ("You don't have your glasses on"), so the dashboard can say so and fall back
to the device camera instead of guessing."""
import base64
import binascii
from datetime import timedelta

from core import contract, db, events, snapshots
from core.errors import ApiError, not_found
from core.ids import new_id
from core.llm import get_llm
from core.timeutil import now
from memory import store

GLASSES_FRESH = timedelta(minutes=2)  # a glasses frame older than this means the glasses are not on
NO_GLASSES = "You don't have your glasses on."
NO_VIEW = "I can't see anything right now. Point the camera at it first."


# ---------- settings (one document per skill, per user) ----------
def get_settings(key: str, defaults: dict) -> dict:
    doc = db.col("skill_settings").find_one({"_id": key}) or {}
    return {**defaults, **{k: v for k, v in doc.items() if k in defaults}}


def save_settings(key: str, defaults: dict, patch: dict) -> dict:
    new = {**get_settings(key, defaults), **{k: v for k, v in patch.items() if k in defaults and v is not None}}
    db.col("skill_settings").update_one({"_id": key}, {"$set": new}, upsert=True)
    return new


# ---------- the view ----------
def decode(value: str | None) -> bytes | None:
    if not value:
        return None
    if value.startswith("data:") and "," in value[:80]:
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=False) or None
    except (binascii.Error, ValueError) as exc:
        raise ApiError(400, "bad_request", "snapshot_base64 is not valid base64.") from exc


def glasses_moment() -> dict | None:
    doc = db.col("moments").find_one({"source": "glasses", "snapshot_url": {"$ne": None}}, {"embedding": 0},
                                     sort=[("ts", -1)])
    return doc if doc and now() - store.as_dt(doc["ts"]) <= GLASSES_FRESH else None


def glasses_status() -> dict:
    doc = glasses_moment()
    return {"available": bool(doc), "moment_id": doc["_id"] if doc else None,
            "age_seconds": int((now() - store.as_dt(doc["ts"])).total_seconds()) if doc else None,
            "message": None if doc else NO_GLASSES}


def view(snapshot_base64: str | None = None, moment_id: str | None = None, source: str | None = None,
         required: bool = True) -> tuple[bytes | None, dict | None]:
    """(image bytes, the moment it came from or None). Raises 409 when a view is required and missing."""
    image = decode(snapshot_base64)
    if image:
        return image, None
    doc = None
    if moment_id:
        doc = store.get_moment(moment_id)
        if not doc:
            raise not_found("moment")
    elif source == "glasses":
        doc = glasses_moment()
        if not doc and required:
            raise ApiError(409, "no_glasses", NO_GLASSES)
    if doc:
        image = snapshots.load_bytes(doc.get("snapshot_url"))
    if not image and required:
        raise ApiError(409, "no_view", NO_VIEW)
    return image, doc


# ---------- saving ----------
def save_moment(*, transcript: str | None, caption: str | None, image: bytes | None, tags: list[str],
                source: str = "dashboard") -> dict:
    """Store what a skill saw and said as a moment (so it is searchable, citable and deletable). 409 when paused."""
    state = store.privacy()["state"]
    if state != "capturing":
        raise ApiError(409, state, f"Capture is {state.replace('_', '-')}; nothing was stored.")
    snap = snapshots.save(image) if image else None
    text = " ".join(filter(None, [transcript, caption]))
    doc = {"_id": new_id("mom"), "ts": now(), "source": source, "mode": store.active_mode(), "transcript": transcript,
           "caption": caption, "snapshot_url": snap, "place": None, "video_url": None, "video_duration_seconds": None,
           "person_ids": [], "off_record": False, "call_id": None, "tags": tags,
           "embedding": get_llm().embed(text or "moment"), "created_at": now()}
    store.insert_moment(doc)
    events.publish("moment.created", contract.moment(doc))
    return doc


def say(spoken: str, text: str | None = None, **extra) -> dict:
    return {"spoken": (spoken or "").strip()[:300], "text": (text or spoken or "").strip(), **extra}
