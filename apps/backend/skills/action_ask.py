"""Spoken replies to the pending action (ACT-1 step 3, VOI-3, VOI-4): "yes", "save a draft", "skip", "undo", "edit".

The wearer hears a proposal ("Draft a follow-up to Ash. Say yes, edit or skip") and answers in one word. A reply only
counts when the whole utterance is the command, so "yes the deck is ready" never approves a send. The target is the
open action the dashboard card shows: the active mode's, still proposed (or failed, so a retry works). Texts and
emails still need that yes (PRIV-8); a caregiver summary is confirmed in its own sheet, never by voice.
Checked after the mode routes in skills/ask.py, so a pending mode suggestion still takes "yes" first."""
import re

from actions import followup, texting
from core import db
from core.config import settings
from core.errors import ApiError
from core.timeutil import now
from memory import store
from skills import network

APPROVE = re.compile(r"^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|do it|send it|text it|add it|save it|approve(?: it)?|go ahead|"
                     r"confirm|looks good|that works)(?:,? please)?[.!]?\s*$", re.I)
DRAFT = re.compile(r"^\s*(?:(?:just )?save (?:it |that )?(?:as )?(?:a )?draft|(?:just )?draft it)[.!]?\s*$", re.I)
SKIP = re.compile(r"^\s*(?:skip(?: it| that)?|dismiss(?: it| that)?|not now|no(?:pe)?(?: thanks)?|don'?t(?: send(?: it)?)?|"
                  r"never ?mind|forget it)[.!]?\s*$", re.I)
UNDO = re.compile(r"^\s*(?:undo(?: that| it)?|take (?:it|that) back|cancel (?:that|it))[.!]?\s*$", re.I)
EDIT = re.compile(r"^\s*(?:edit(?: it| that)?|change (?:it|that)|let me edit(?: it)?)[.!]?\s*$", re.I)
TEXT_CMD = re.compile(r"^\s*(?:text|message|send (?:a )?(?:text|message) to)\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?)"
                      r"\s*(?:[,:]|\s+(?:that|saying|say|to say))?\s+(.+?)\s*$", re.I)
VOICE_OK = {"follow_up_email", "calendar_event", "reminder", "flashcards", "notes", "message", "read_aloud", "expense"}


def pending_action() -> dict | None:
    """The open action in the active mode that the card is showing: the newest, so "yes" after "Text Ash ..." is
    about that text and not an older suggestion still waiting."""
    mode = store.active_mode()
    docs = [d for d in db.col("actions").find({"status": {"$in": ["proposed", "failed"]}}).sort("created_at", -1)
            if d["type"] in VOICE_OK and (d.get("mode") or ("focus" if d["type"] == "follow_up_email" else None)) == mode]
    return docs[0] if docs else None


def _undoable() -> dict | None:
    for r in db.col("receipts").find({"action_id": {"$ne": None}, "undo.available": True}).sort("created_at", -1):
        if r["undo"].get("until") and r["undo"]["until"] > now():
            return db.col("actions").find_one({"_id": r["action_id"]})
    return None


def _plain(text: str) -> str:
    """A receipt line read aloud: no curly quotes or parenthetical dry-run notes."""
    return re.sub(r"\s*\([^)]*\)", "", text).replace("“", "").replace("”", "").strip()


def _say(result, q: str, text: str, doc: dict | None) -> dict:
    src = store.moments_by_ids(doc["source_moment_ids"]) if doc else []
    return result(q, text, text, src, bool(src))


def _text_command(q: str, result):
    """"Text Ash I'm running late": a proposal, never a send. Only for someone on a card; the wearer still says yes."""
    m = TEXT_CMD.match(q)
    if not m:
        return None
    words = m.group(1).split()
    for n in range(len(words), 0, -1):  # longest name first: "Text Ash Kim I'm late" before "Text Ash"
        said = " ".join(words[:n]).lower()
        person = network.find_by_name(said) or next(
            (p for p in db.col("people").find() if network.given_name(p["name"]).lower() == said), None)
        if person and said in (person["name_lower"], person.get("first_lower"), network.given_name(person["name"]).lower()):
            body = re.sub(r"^(?:that|saying|say|to say)\s+", "", " ".join([*words[n:], m.group(2)]).strip(), flags=re.I)
            first = network.given_name(person["name"])
            try:
                act = texting.propose_for_person(person["_id"], body)
            except ApiError as exc:
                return result(q, exc.message, exc.message, [], False)
            say = f"Text to {first}: {body}. Say yes to send it, or skip."
            return result(q, say, say, store.moments_by_ids(act["source_moment_ids"]), True)
    return None


def route(q: str, channel: str, result):
    """An answer dict, or None to fall through to the other /ask routes."""
    texted = _text_command(q, result)
    if texted:
        return texted
    if UNDO.match(q):
        doc = _undoable()
        if not doc:
            return result(q, "There's nothing to undo right now.", "There's nothing to undo right now.", [], False)
        try:
            out = followup.undo(doc["_id"])
        except ApiError as exc:
            return _say(result, q, exc.message, doc)
        return _say(result, q, _plain(out["receipt"]["summary"]), doc)

    approve, draft, skip, edit = APPROVE.match(q), DRAFT.match(q), SKIP.match(q), EDIT.match(q)
    if not (approve or draft or skip or edit):
        return None
    doc = pending_action()
    if not doc:
        return None  # nothing is waiting, so "yes" or "no" is not about an action

    title = doc.get("title") or "that"
    if edit:
        return _say(result, q, f"Tap Edit on the card to change “{title}”, or say yes or skip.", doc)
    try:
        if skip:
            followup.dismiss(doc["_id"])
            return _say(result, q, f"Skipped. {_plain(title)} was not done.", doc)
        if draft:
            if doc["type"] != "follow_up_email":
                return _say(result, q, "Only an email can be saved as a draft. Say yes or skip.", doc)
            out = followup.confirm(doc["_id"], "draft", None)
        else:
            deliver = "send" if doc["type"] in {"follow_up_email", "message"} else "do"
            out = followup.confirm(doc["_id"], deliver, None)
    except ApiError as exc:
        return _say(result, q, exc.message, doc)
    status = out["action"]["status"]
    summary = _plain(out["receipt"]["summary"])
    if status == "failed":
        return _say(result, q, f"{summary} Say yes to try again, or skip.", doc)
    if out["receipt"]["undo"]["available"]:
        summary += f" Say undo within {settings.undo_seconds} seconds to take it back."
    return _say(result, q, summary, doc)
