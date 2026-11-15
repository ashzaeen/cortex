"""POST /actions/generate: turn one stored moment into a proposed action Cortex writes itself.

STU-2 flashcards from a slide or board, FOC-3 whiteboard to notes, AST-2 read aloud. The user asked for it,
so it works in any mode (allowed_actions only limits what Cortex suggests on its own). Still a proposal:
nothing is saved to Drive or read until the user confirms."""
from actions import doers
from core import db, snapshots
from core.errors import ApiError, not_found
from core.llm import get_llm
from core.timeutil import human, now
from memory import store

KINDS = {"flashcards", "notes", "read_aloud"}
SUMMARY = {"flashcards": "Save these flashcards to your Google Drive.", "notes": "Save these notes to your Google Drive.",
           "read_aloud": "Read this aloud."}


def _source(moment_id: str | None) -> dict:
    if moment_id:
        doc = store.get_moment(moment_id)
        if not doc:
            raise not_found("moment")
        return doc
    doc = db.col("moments").find_one({"snapshot_url": {"$ne": None}}, sort=[("ts", -1)]) or db.col("moments").find_one(
        sort=[("ts", -1)])
    if not doc:
        raise ApiError(400, "bad_request", "There is no moment to work from yet. Capture one first.")
    return doc


def generate(kind: str, moment_id: str | None = None, mode: str | None = None) -> dict:
    if kind not in KINDS:
        raise ApiError(400, "bad_request", f"type must be one of {', '.join(sorted(KINDS))}.")
    m = _source(moment_id)
    image = snapshots.load_bytes(m.get("snapshot_url")) if m.get("snapshot_url") else None
    data = get_llm().generate(kind=kind, transcript=m.get("transcript") or "", caption=m.get("caption") or "",
                              image=image, now_local=human(now())) or {}
    body = (data.get("body") or "").strip()
    if not body:
        raise ApiError(400, "nothing_found", "Cortex couldn't find anything to use in that moment.")
    title = (data.get("title") or kind.replace("_", " ").capitalize()).strip()[:120]
    payload = {"type": kind, "title": title, "summary": SUMMARY[kind], "mode": mode or store.active_mode(),
               "source_moment_ids": [m["_id"]], "person_id": (m.get("person_ids") or [None])[0]}
    if kind == "read_aloud":
        payload["summary"] = body[:600]
    else:
        payload["doc"] = {"title": title, "body": body}
    return doers.propose(payload)
