"""Look and answer now (POST /look): AST-1 describe, AST-2 read, AST-3 hazards, AST-4 find, STU-3 tutor.

Nothing is stored. The view is the snapshot sent with the request (what the camera sees now), else a
named moment, else the newest moment with a snapshot from the last 10 minutes. find without any view
searches memory instead and answers with where the object was last seen. Assist is support, not a
medical or mobility device, and never says it is safe to move."""
import base64
import binascii
from datetime import timedelta

from core import contract, db
from core.errors import ApiError, not_found
from core.llm import get_llm
from core.timeutil import human, now
from memory import search, store

RECENT = timedelta(minutes=10)
TASKS = {"describe", "read", "hazards", "find", "tutor"}
NO_VIEW = "I can't see anything right now. Take a snapshot first."


def _image(value: str | None) -> bytes | None:
    if not value:
        return None
    if value.startswith("data:") and "," in value[:80]:
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=False) or None
    except (binascii.Error, ValueError) as exc:
        raise ApiError(400, "bad_request", "snapshot_base64 is not valid base64.") from exc


def latest_view() -> dict | None:
    doc = db.col("moments").find_one({"snapshot_url": {"$ne": None}}, {"embedding": 0}, sort=[("ts", -1)])
    return doc if doc and now() - doc["ts"] <= RECENT else None


def _found_in_memory(target: str) -> dict:
    hits = [d for d, _ in search.search(f"where is my {target}", limit=3)]
    hit = next((d for d in hits if target.lower() in " ".join(filter(None, [d.get("transcript"), d.get("caption")])).lower()),
               None)
    if not hit:
        msg = f"I don't see {target} and I don't have it in memory."
        return {"task": "find", "spoken": msg, "text": msg, "found": False, "moment": None}
    where = hit.get("caption") or hit.get("transcript") or ""
    msg = f"Last seen {human(hit['ts'])}: {where}"
    return {"task": "find", "spoken": msg[:200], "text": msg, "found": True, "moment": contract.moment(hit)}


def look(task: str, target: str | None = None, question: str | None = None, snapshot_base64: str | None = None,
         moment_id: str | None = None) -> dict:
    if task not in TASKS:
        raise ApiError(400, "bad_request", f"task must be one of {', '.join(sorted(TASKS))}.")
    if task == "find" and not (target or "").strip():
        raise ApiError(400, "bad_request", "target is required for find.")
    image = _image(snapshot_base64)
    doc = None
    if not image:
        if moment_id:
            doc = store.get_moment(moment_id)
            if not doc:
                raise not_found("moment")
        else:
            doc = latest_view()
        if not doc:
            if task == "find":
                return _found_in_memory(target.strip())
            raise ApiError(409, "no_view", NO_VIEW)
        from core import snapshots

        image = snapshots.load_bytes(doc.get("snapshot_url"))
    data = get_llm().look(task=task, image=image, target=(target or "").strip(), question=(question or "").strip(),
                          now_local=human(now()), caption=(doc or {}).get("caption")) or {}
    spoken = (data.get("spoken") or "").strip() or "I couldn't make that out."
    found = data.get("found") if task in {"find", "hazards"} else None
    result = {"task": task, "spoken": spoken[:300], "text": (data.get("text") or spoken).strip(),
              "found": bool(found) if found is not None else None, "moment": contract.moment(doc) if doc else None}
    if task == "find" and not result["found"] and not snapshot_base64:
        return _found_in_memory(target.strip())
    return result
