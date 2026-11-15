"""Rewind (MEM-10): "What did I promise Ash an hour ago?" replays that exact transcript line with its snapshot.

Search (with the question's time phrase as a range, and the named person as a filter when there is one),
then quote the single sentence of the best moment that matches the question. Never paraphrases: the line
is copied from the stored transcript, so it is proof by construction. Nothing matching -> found=false."""
import re

from core import contract
from core.llm_mock import words
from core.timeutil import human
from memory import search
from skills import network

REWIND_RE = re.compile(r"\b(rewind|replay|play (?:it |that )?back|word for word|exact(?:ly)? (?:words|what)|"
                       r"what exactly did)\b", re.I)
NO_MATCH = "I can't find that moment in memory."
# Words that frame the question but never appear in the moment itself.
_FRAME = set("rewind replay play back exact exactly word say said tell told promise promised ago hour minute "
             "earlier today yesterday morning afternoon last just again".split())


def wants_rewind(question: str) -> bool:
    return bool(REWIND_RE.search(question or ""))


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]


def best_line(question: str, doc: dict) -> str | None:
    q = set(words(question)) - _FRAME
    lines = _sentences(doc.get("transcript") or "")
    if not lines:
        return None
    return max(lines, key=lambda s: (len(q & set(words(s))), -lines.index(s)))


def rewind(question: str) -> dict:
    q = (question or "").strip()
    people = network.mentioned_in(q)
    content = set(words(q)) - _FRAME - {w for p in people for w in words(p["name"])}

    def overlap(d: dict) -> int:
        return len(content & set(words(" ".join(filter(None, [d.get("transcript"), d.get("caption")])))))

    hits = []
    if len(people) == 1:  # the named person's moments; the one sharing the most words with the question wins
        hits = search.search(q, limit=8, person_id=people[0]["_id"])
    if not hits:
        hits = [(d, s) for d, s in search.search(q, limit=8) if overlap(d)]
    if not hits:
        return {"found": False, "moment": None, "line": None, "spoken": NO_MATCH}

    doc = max(hits, key=lambda t: (overlap(t[0]), t[1]))[0]
    line = best_line(q, doc)
    who = next((p for p in people if p["_id"] in doc.get("person_ids", [])), None)
    when = human(doc["ts"])
    with_who = f", with {who['name']}" if who else ""
    if line:
        spoken = f'{when[0].upper()}{when[1:]}{with_who}: "{line}"'
    else:
        spoken = f"{when[0].upper()}{when[1:]}{with_who}, you saw {doc.get('caption') or 'this'}."
    return {"found": True, "moment": contract.moment(doc), "line": line, "spoken": spoken}
