"""Offline answers for the content features. Brief, digest, recap and caregiver return {} on purpose: their skills then
build the answer from the stored records with a template, so the offline path is grounded and identical every run.
Flashcards and notes cut the sentences that were heard into cards and points."""
import re


def _sentences(transcript: str, caption: str) -> list[str]:
    text = " ".join(filter(None, [transcript, caption if caption != "(nothing)" else ""]))
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 12]


def run(task: str, **kw) -> dict:
    if task in {"flashcards", "notes"}:
        src = _sentences(kw.get("transcript", ""), kw.get("caption", ""))
        if task == "flashcards":
            cards = [{"q": "What was said about " + " ".join(re.findall(r"[A-Za-z0-9']+", s)[:4]) + "?", "a": s} for s in src[:5]]
            return {"title": "Flashcards", "cards": cards if len(cards) >= 3 else []}
        return {"title": "Notes", "heading": "Notes", "points": src[:7], "terms": [], "dates": []}
    return {}
