"""POST /actions/generate: turn one stored moment into a proposed action Cortex writes itself.

STU-2 flashcards from a slide or board, FOC-3 whiteboard to notes, AST-2 read aloud. The user asked for it,
so it works in any mode (allowed_actions only limits what Cortex suggests on its own). Still a proposal:
nothing is saved to Drive or read until the user confirms.

Quality gates (#54): flashcards must be real, one testable fact each, no duplicates, and a moment with too
little in it is refused with a clear message instead of producing junk. Notes get a heading, points, terms and
dates. Read aloud reads only the words that were said or printed, never the clock or a description."""
import re

from actions import doers
from core import content, db, snapshots
from core.errors import ApiError, not_found
from core.llm import get_llm
from core.timeutil import human, now
from memory import store

KINDS = {"flashcards", "notes", "read_aloud"}
SUMMARY = {"flashcards": "Save these flashcards to your Google Drive.", "notes": "Save these notes to your Google Drive.",
           "read_aloud": "Read this aloud."}
MAX_CARDS = 6


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


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def flashcards(data: dict) -> tuple[str, str]:
    """(title, body) with one 'Q: ... / A: ...' per line. Drops vague, duplicate and answerless cards."""
    cards, seen = [], set()
    for c in data.get("cards") or []:
        q, a = (str(c.get("q") or "").strip(), str(c.get("a") or "").strip()) if isinstance(c, dict) else ("", "")
        q, a = q.replace("\n", " "), a.replace("\n", " ")
        if len(q) < 8 or not a or _key(q) in seen or _key(q) == _key(a) or re.match(r"(?i)what was the context", q):
            continue
        seen.add(_key(q))
        cards.append(f"Q: {q} / A: {a}")
    if not cards:
        raise ApiError(400, "not_enough_content", "There isn't enough in that moment to make flashcards. "
                       "Try a slide, a board or part of a lecture.")
    return str(data.get("title") or "").strip() or "Flashcards", "\n".join(cards[:MAX_CARDS])


def notes(data: dict) -> tuple[str, str]:
    """(title, body): a heading line, '- ' points, then Terms and Dates lines when there are any."""
    points = [str(p).strip() for p in data.get("points") or [] if str(p).strip()][:7]
    if not points:
        raise ApiError(400, "nothing_found", "Cortex couldn't find anything to use in that moment.")
    title = str(data.get("title") or "").strip() or "Notes"
    lines = [str(data.get("heading") or title).strip(), *[f"- {p}" for p in points]]
    for label, key in (("Terms", "terms"), ("Dates", "dates")):
        items = [str(x).strip() for x in data.get(key) or [] if str(x).strip()]
        if items:
            lines.append(f"{label}: {', '.join(items[:6])}")
    return title, "\n".join(lines)


def read_aloud(m: dict, image: bytes | None) -> tuple[str, str]:
    """Only the words: what was said, else the text printed in the picture (read by the model, verbatim)."""
    said = (m.get("transcript") or "").strip()
    if said:
        return "Read aloud", said
    data = get_llm().generate(kind="read_aloud", transcript="", caption=m.get("caption") or "", image=image,
                              now_local=human(now())) or {}
    return (data.get("title") or "Read aloud").strip()[:120], (data.get("body") or "").strip()


def generate(kind: str, moment_id: str | None = None, mode: str | None = None) -> dict:
    if kind not in KINDS:
        raise ApiError(400, "bad_request", f"type must be one of {', '.join(sorted(KINDS))}.")
    m = _source(moment_id)
    image = snapshots.load_bytes(m.get("snapshot_url")) if m.get("snapshot_url") else None
    if kind == "read_aloud":
        title, body = read_aloud(m, image)
    else:
        data = content.run(kind, image, transcript=m.get("transcript") or "", caption=m.get("caption") or "",
                           now_local=human(now())) or {}
        title, body = (flashcards if kind == "flashcards" else notes)(data)
    if not body:
        raise ApiError(400, "nothing_found", "Cortex couldn't find anything to use in that moment.")
    title = title[:120]
    payload = {"type": kind, "title": title, "summary": SUMMARY[kind], "mode": mode or store.active_mode(),
               "source_moment_ids": [m["_id"]], "person_id": (m.get("person_ids") or [None])[0]}
    if kind == "read_aloud":
        payload["summary"] = body[:600]
    else:
        payload["doc"] = {"title": title, "body": body}
    return doers.propose(payload)
