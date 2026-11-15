"""Modes (MODE-1, MODE-2, MODE-7): presets over the one shared memory.

A mode changes what perception listens for (core/prompts.MODE_RULES), which actions Cortex may suggest on
its own (allowed_actions, auto_suggest) and the tools the dashboard offers. Memory is never split by mode.

Switching never happens silently: the dock, a voice command ("switch to Student mode") or a suggestion the
user confirms. Suggestions come from deterministic cues in what was heard and seen (a lecture prompts
Student); they are stored as pending until the user says yes or dismisses them."""
import re
from datetime import timedelta

from core import contract, db, events
from core.errors import ApiError, not_found
from core.prompts import MODE_RULES
from core.timeutil import iso, now, parse_dt
from memory import store

BUILTIN = ("focus", "student", "life", "assist")
ACTION_TYPES = {"follow_up_email", "flashcards", "reminder", "read_aloud", "calendar_event", "notes", "message",
                "caregiver_summary"}
SLUG = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")
EDITABLE = {"name", "description", "captures", "speaks", "proposes", "allowed_actions", "auto_suggest", "retention_days"}
SUGGEST_COOLDOWN = timedelta(minutes=30)
PENDING_TTL = timedelta(minutes=10)


# ---------- reading ----------
def get(mode_id: str) -> dict | None:
    store.ensure_modes()
    return db.col("modes").find_one({"_id": mode_id})


def exists(mode_id: str | None) -> bool:
    return bool(mode_id) and get(mode_id) is not None


def name_of(mode_id: str) -> str:
    doc = get(mode_id)
    return doc["name"] if doc else mode_id.capitalize()


def perception_rules(mode_id: str) -> str:
    """Extra perception rules for this mode. Custom modes use no extra rules (MODE-7 keeps them simple)."""
    return MODE_RULES.get(mode_id, "")


def allows(kind: str, mode_id: str | None) -> bool:
    """May Cortex suggest this action type on its own in this mode? (Explicit requests skip this check.)"""
    doc = get(mode_id or store.active_mode())
    if not doc:
        return True
    return bool(doc.get("auto_suggest", True)) and kind in (doc.get("allowed_actions") or [])


def spoken_label(mode_id: str) -> str:
    return f"{name_of(mode_id)} mode."


# ---------- switching ----------
def activate(mode_id: str) -> dict:
    mode = store.set_active_mode(mode_id)
    if mode is None:
        raise not_found("mode")
    db.col("state").delete_one({"_id": "mode_suggestion"})
    events.publish("mode.changed", mode)
    return mode


_SWITCH = re.compile(r"\b(?:switch|change|go|turn|move|put me)\s+(?:back\s+)?(?:to|into|in|on)\s+(?:the\s+)?"
                     r"([a-z][\w -]{1,30}?)\s+mode\b"
                     r"|\b([a-z][\w-]{1,30})\s+mode\s+(?:on|please)\b|^\s*([a-z][\w-]{1,30})\s+mode[.!]?\s*$", re.I)


def switch_command(text: str | None) -> str | None:
    """The mode a voice command asks for ("Switch to Student mode", "Life mode on"), or None."""
    m = _SWITCH.search(text or "")
    if not m:
        return None
    said = next(g for g in m.groups() if g).strip().lower()
    for doc in db.col("modes").find():
        if said in {doc["_id"], doc["name"].lower()}:
            return doc["_id"]
    return None


# ---------- auto-suggest (MODE-2) ----------
# Cue -> weight. A mode is suggested when its cues add up to 2 or more in one moment.
CUES = {
    "student": {"lecture": 2, "professor": 2, "syllabus": 2, "homework": 2, "problem set": 2, "midterm": 2, "quiz": 1,
                "exam": 1, "class": 1, "slide": 1, "slides": 1, "lab": 1, "chapter": 1, "students": 1, "lecture hall": 2},
    "life": {"grocery": 2, "groceries": 2, "shopping list": 2, "keys": 1, "wallet": 1, "dinner": 1, "errand": 2,
             "receipt": 1, "kitchen": 1, "laundry": 2, "pick up": 1},
    "assist": {"read this": 2, "what's in front of me": 2, "what is in front of me": 2, "where is the door": 2,
               "medicine": 2, "medication": 2, "read the label": 2, "menu": 1, "sign": 1},
    "focus": {"meeting": 2, "agenda": 2, "standup": 2, "stand-up": 2, "client": 1, "deck": 1, "roadmap": 2, "sprint": 2,
              "action item": 2, "quarterly": 1, "whiteboard": 1},
}
REASONS = {"student": "Sounds like a lecture.", "life": "Sounds like errands.",
           "assist": "Sounds like you want help reading or finding.", "focus": "Sounds like a meeting."}


def _score(text: str) -> dict[str, int]:
    low = f" {text.lower()} "
    return {m: sum(w for cue, w in cues.items() if re.search(rf"(?<![a-z]){re.escape(cue)}(?![a-z])", low))
            for m, cues in CUES.items()}


def pending() -> dict | None:
    doc = db.col("state").find_one({"_id": "mode_suggestion"})
    if not doc:
        return None
    at = parse_dt(doc["at"])
    if at and now() - at > PENDING_TTL:
        db.col("state").delete_one({"_id": "mode_suggestion"})
        return None
    return {"mode_id": doc["mode_id"], "reason": doc["reason"], "moment_id": doc.get("moment_id"), "at": iso(at or now())}


def suggest_from(moment: dict) -> dict | None:
    """After ingest: suggest a better-fitting built-in mode, at most once per mode per cooldown."""
    text = " ".join(filter(None, [moment.get("transcript"), moment.get("caption")]))
    if not text or switch_command(moment.get("transcript")):
        return None
    scores = _score(text)
    best = max(scores, key=lambda m: scores[m])
    active = store.active_mode()
    if scores[best] < 2 or best == active or not exists(best) or (pending() or {}).get("mode_id") == best:
        return None
    dismissed = db.col("state").find_one({"_id": "mode_suggestion_dismissed"}) or {}
    last = parse_dt((dismissed.get("by_mode") or {}).get(best))
    if last and now() - last < SUGGEST_COOLDOWN:
        return None
    s = {"mode_id": best, "reason": REASONS[best], "moment_id": moment["_id"], "at": iso(now())}
    db.col("state").replace_one({"_id": "mode_suggestion"}, {"_id": "mode_suggestion", **s}, upsert=True)
    events.publish("mode.suggested", s)
    return s


def dismiss() -> bool:
    s = pending()
    if not s:
        return False
    db.col("state").delete_one({"_id": "mode_suggestion"})
    db.col("state").update_one({"_id": "mode_suggestion_dismissed"}, {"$set": {f"by_mode.{s['mode_id']}": iso(now())}},
                               upsert=True)
    return True


# ---------- decision log (FOC-5) ----------
_DECISION = re.compile(r"\b(?:we(?:'ve| have)? decided|(?:the )?decision is|let'?s go with|we(?:'ll| will) go with|"
                       r"we agreed|agreed to|final call|we're going with|we are going with)\b", re.I)


def tags_for(transcript: str | None) -> list[str]:
    return ["decision"] if _DECISION.search(transcript or "") else []


# ---------- settings and custom modes (DASH-10, MODE-7) ----------
def _check_actions(actions) -> list[str]:
    bad = [a for a in actions or [] if a not in ACTION_TYPES]
    if bad:
        raise ApiError(400, "bad_request", f"Unknown action type: {', '.join(bad)}.")
    return list(dict.fromkeys(actions or []))


def update(mode_id: str, fields: dict) -> dict:
    doc = get(mode_id)
    if not doc:
        raise not_found("mode")
    changes = {k: v for k, v in fields.items() if k in EDITABLE}
    if "allowed_actions" in changes:
        changes["allowed_actions"] = _check_actions(changes["allowed_actions"])
    if "name" in changes and not (changes["name"] or "").strip():
        raise ApiError(400, "bad_request", "name cannot be empty.")
    if changes:
        db.col("modes").update_one({"_id": mode_id}, {"$set": changes})
    out = contract.mode(db.col("modes").find_one({"_id": mode_id}))
    events.publish("mode.changed", out)
    return out


def create(body: dict) -> dict:
    name = (body.get("name") or "").strip()
    if not name:
        raise ApiError(400, "bad_request", "name is required.")
    mode_id = body.get("id") or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:32]
    if not SLUG.match(mode_id or ""):
        raise ApiError(400, "bad_request", "id must be a short lowercase slug, e.g. lab.")
    if get(mode_id):
        raise ApiError(409, "exists", f"A mode called {mode_id} already exists.")
    doc = {"_id": mode_id, "name": name, "description": (body.get("description") or "").strip() or None,
           "captures": list(body.get("captures") or []), "speaks": body.get("speaks") or "on request",
           "proposes": list(body.get("proposes") or []), "allowed_actions": _check_actions(body.get("allowed_actions")),
           "auto_suggest": bool(body.get("auto_suggest", True)), "retention_days": body.get("retention_days"),
           "custom": True, "active": False, "created_at": now()}
    db.col("modes").insert_one(doc)
    return contract.mode(doc)


def delete(mode_id: str) -> dict:
    doc = get(mode_id)
    if not doc:
        raise not_found("mode")
    if not doc.get("custom"):
        raise ApiError(409, "builtin", "Built-in modes cannot be deleted.")
    db.col("modes").delete_one({"_id": mode_id})
    if doc.get("active"):
        activate("focus")
    return {"deleted": mode_id}
