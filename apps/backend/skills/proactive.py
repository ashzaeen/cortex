"""SKL-7 Proactive nudge: when you keep looking at something confusing, Cortex offers help. An offer, never an action.

Trigger: the client sends a frame every few seconds while this is on (POST /skills/proactive/observe). Inputs: the
frame, and how long the same confusing scene has been in view. Steps: label the scene, track how long it stays the
same, and past the dwell time (and outside the cooldown) create an offer. Output: a `skill.offer` event and an offer
the user can accept (Cortex then explains it, via Ask the world) or dismiss. Confirmation: always asks first.
Undo: dismiss. Off by default, because false triggers are the risk; a dismissed offer doubles the cooldown. Frames
are never stored. If unsure: no confident "confusing" label, no offer."""
from datetime import timedelta

from core import db, events
from core.errors import ApiError, not_found
from core.ids import new_id
from core.llm import get_llm
from core.timeutil import iso, now
from skills import kit, world

DEFAULTS = {"enabled": False, "dwell_seconds": 20, "cooldown_minutes": 30}
STATE = "proactive_state"


def settings(patch: dict | None = None) -> dict:
    if patch:
        if "dwell_seconds" in patch and not 0 <= int(patch["dwell_seconds"]) <= 600:
            raise ApiError(400, "bad_request", "dwell_seconds must be 0 to 600.")
        if "cooldown_minutes" in patch and not 0 <= int(patch["cooldown_minutes"]) <= 1440:
            raise ApiError(400, "bad_request", "cooldown_minutes must be 0 to 1440.")
        return kit.save_settings("proactive", DEFAULTS, patch)
    return kit.get_settings("proactive", DEFAULTS)


def out(d: dict) -> dict:
    return {"id": d["_id"], "scene": d["scene"], "text": d["text"], "status": d["status"], "created_at": iso(d["created_at"])}


def _state() -> dict:
    return db.col("skill_settings").find_one({"_id": STATE}) or {}


def _set_state(**fields):
    db.col("skill_settings").update_one({"_id": STATE}, {"$set": fields}, upsert=True)


def observe(snapshot_base64: str | None, moment_id: str | None = None, source: str | None = None) -> dict:
    cfg = settings()
    if not cfg["enabled"]:
        return {"offered": False, "reason": "disabled", "dwell_seconds": 0, "offer": None}
    image, _ = kit.view(snapshot_base64, moment_id, source)
    seen = get_llm().skill("scene", image) or {}
    scene = (seen.get("scene") or "").strip().lower()
    t, st = now(), _state()
    if not scene or not seen.get("confusing"):
        _set_state(scene=None, since=None)
        return {"offered": False, "reason": "nothing_confusing", "dwell_seconds": 0, "offer": None}
    since = st.get("since") if st.get("scene") == scene and st.get("since") else t
    if since is t:
        _set_state(scene=scene, since=t)
    dwell = int((t - kit.store.as_dt(since)).total_seconds())
    if dwell < cfg["dwell_seconds"]:
        return {"offered": False, "reason": "watching", "dwell_seconds": dwell, "offer": None}
    last = kit.store.as_dt(st.get("last_offer_at"))
    cool = timedelta(minutes=cfg["cooldown_minutes"] * (2 if st.get("last_dismissed") else 1))
    if last and t - last < cool:
        return {"offered": False, "reason": "cooldown", "dwell_seconds": dwell, "offer": None}
    doc = {"_id": new_id("off"), "scene": scene, "text": (seen.get("offer") or "Want help with this?").strip(),
           "status": "offered", "created_at": t}
    db.col("offers").insert_one(doc)
    _set_state(last_offer_at=t, last_dismissed=False, scene=None, since=None)
    events.publish("skill.offer", out(doc))
    return {"offered": True, "reason": "offered", "dwell_seconds": dwell, "offer": out(doc)}


def list_offers() -> list[dict]:
    return [out(d) for d in db.col("offers").find({"status": "offered"}).sort("created_at", -1)]


def _get(offer_id: str) -> dict:
    d = db.col("offers").find_one({"_id": offer_id})
    if not d:
        raise not_found("offer")
    return d


def accept(offer_id: str, snapshot_base64: str | None = None, source: str | None = None) -> dict:
    d = _get(offer_id)
    result = world.answer(f"Explain what this is and what to do about it: {d['scene']}", snapshot_base64, None, source)
    db.col("offers").update_one({"_id": offer_id}, {"$set": {"status": "accepted"}})
    return result


def dismiss(offer_id: str) -> dict:
    _get(offer_id)
    db.col("offers").update_one({"_id": offer_id}, {"$set": {"status": "dismissed"}})
    _set_state(last_dismissed=True)
    return {"id": offer_id, "status": "dismissed"}
