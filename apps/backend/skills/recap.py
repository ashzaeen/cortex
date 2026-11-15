"""Recap of the latest session: FOC-2 meeting recap, STU-1 live lecture notes, FOC-1 action items.

A session is the newest run of moments with no gap over 30 minutes. The notes are one line per moment
(what was said, else what was seen), so they are always grounded. Decisions come from moments tagged
decision (FOC-5); follow-ups from the session's promises and open proposed actions. The model only adds
the title, spoken summary and key points, and anything it cites must be a session moment."""
import re
from datetime import timedelta

from core import content, db
from core.timeutil import human, iso, now
from skills.brief import promise_line

GAP = timedelta(minutes=30)
_TODO = re.compile(r"\b(?:i need to|we need to|i have to|to-?do|action item|don't forget to|remember to|i'll|we'll)\b", re.I)


def session(mode: str | None = None, limit: int = 60, exclude_mode: str | None = None) -> list[dict]:
    """The newest session's moments, oldest first."""
    q = {"mode": mode} if mode else ({"mode": {"$ne": exclude_mode}} if exclude_mode else {})
    docs = list(db.col("moments").find(q, {"embedding": 0}).sort("ts", -1).limit(limit))
    out = []
    for d in docs:
        if out and out[-1]["ts"] - d["ts"] > GAP:
            break
        out.append(d)
    return list(reversed(out))


def _line(m: dict) -> str:
    return (m.get("transcript") or m.get("caption") or "").strip()


def _rl(text: str, m: dict) -> dict:
    return {"text": text[:300], "moment_id": m["_id"], "at": iso(m["ts"])}


def recap(mode: str | None = None, kind: str = "meeting") -> dict:
    # Asking for a lecture means Student mode; asking for a meeting means anything that is not a lecture. Without this a
    # "meeting" recap could be the lecture, or whatever happened to be captured last.
    docs = session(mode) if mode else (session("student") if kind == "lecture" else session(exclude_mode="student"))
    if not docs:
        what = "lecture" if kind == "lecture" else "meeting"
        return {"kind": kind, "mode": mode, "title": f"No {what} yet", "spoken": f"I don't have a {what} in memory yet.",
                "bullets": [], "notes": [], "decisions": [], "follow_ups": [], "auto_actions": [],
                "started_at": None, "ended_at": None, "moment_count": 0, "source_moment_ids": []}
    ids = {m["_id"] for m in docs}
    by_id = {m["_id"]: m for m in docs}
    notes = [_rl(_line(m), m) for m in docs if _line(m)]
    decisions = [_rl(_line(m), m) for m in docs if "decision" in (m.get("tags") or []) and _line(m)]

    follow_ups, seen = [], set()
    for p in db.col("promises").find({"source_moment_id": {"$in": list(ids)}, "status": {"$in": ["proposed", "confirmed"]}}):
        person = db.col("people").find_one({"_id": p["person_id"]})
        text = promise_line(p, person) if person else p["what"]
        follow_ups.append(_rl(text, by_id[p["source_moment_id"]]))
        seen.add(p["source_moment_id"])
    for m in docs:
        if m["_id"] not in seen and _TODO.search(m.get("transcript") or ""):
            follow_ups.append(_rl(m["transcript"], m))

    from skills.ask import moments_block

    open_p = "\n".join(f"- {f['text']} [{f['moment_id']}]" for f in follow_ups) or "(none)"
    data = content.run("recap", kind=kind, now_local=human(now()), moments=moments_block(docs), promises=open_p) or {}

    def cited(items) -> list[dict]:
        out = []
        for it in items or []:
            if isinstance(it, dict) and it.get("moment_id") in ids and (it.get("text") or "").strip():
                out.append(_rl(it["text"].strip(), by_id[it["moment_id"]]))
        return out

    # The model may restate what was already extracted (a tagged decision, a stored promise): one entry per moment is enough.
    known = {d["moment_id"] for d in decisions} | {d["text"] for d in decisions}
    decisions += [d for d in cited(data.get("decisions")) if d["text"] not in known and d["moment_id"] not in known]
    known = {f["moment_id"] for f in follow_ups} | {f["text"] for f in follow_ups}
    follow_ups += [f for f in cited(data.get("follow_ups")) if f["text"] not in known and f["moment_id"] not in known]
    auto_actions = []
    for a in db.col("actions").find({"auto": True, "status": {"$in": ["done", "sent", "draft_saved"]},
                                     "source_moment_ids": {"$in": list(ids)}}):
        rcp = db.col("receipts").find_one({"action_id": a["_id"]}, sort=[("created_at", -1)])
        mid = next(i for i in a["source_moment_ids"] if i in ids)
        auto_actions.append(_rl(rcp["summary"] if rcp else a.get("title", "Done"), by_id[mid]))
    label = "lecture" if kind == "lecture" else "meeting"
    start, end = docs[0]["ts"], docs[-1]["ts"]
    count = f"{len(docs)} moment{'s' if len(docs) != 1 else ''}"
    spoken = (data.get("spoken") or "").strip() or (
        f"Your {label}: {count}. " + (f"Decided: {decisions[0]['text']}. " if decisions else "")
        + (f"Open: {follow_ups[0]['text']}." if follow_ups else "Nothing is open."))
    bullets = [b.strip() for b in data.get("bullets") or [] if isinstance(b, str) and b.strip()][:5]
    bullets = bullets or [n["text"] for n in notes[:4]]
    return {"kind": kind, "mode": mode, "title": (data.get("title") or f"Your {label}").strip()[:80], "spoken": spoken,
            "bullets": bullets, "notes": notes, "decisions": decisions, "follow_ups": follow_ups,
            "auto_actions": auto_actions, "started_at": iso(start), "ended_at": iso(end), "moment_count": len(docs),
            "source_moment_ids": [m["_id"] for m in docs]}
