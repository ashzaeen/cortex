"""Ask with proof (T0-5). Answers ONLY from retrieved moments; otherwise grounded=false. Every answer
writes a receipt (kind answer) and returns its source moments.

Order: 1) "brief me on <name>" -> the brief; 2) questions about a known person's promises ("What did Ash
promise me?", "What is open with Ash?") -> answered straight from the promises table with their source
moments (deterministic, demo-safe); 3) anything else -> search + Gemini, citations checked against hits."""
import re

from core import contract, receipts
from core.llm import get_llm
from core.timeutil import human, now
from memory import search, store
from skills import brief as brief_skill
from skills import network, promises

NO_ANSWER = "I don't have that in memory."
PROMISE_WORDS = re.compile(r"\b(promis\w*|owe\w*|open|waiting|pending|send|sending|deliver|follow[- ]?up)\b", re.I)
BRIEF_RE = re.compile(r"\bbrief me (?:on|about)\s+(.+?)[.?!]*$", re.I)


def moments_block(docs: list[dict]) -> str:
    lines = []
    for m in docs:
        parts = [f"[{m['_id']}] {human(m['ts'])}"]
        if m.get("transcript"):
            parts.append(f'heard: "{m["transcript"][:300]}"')
        if m.get("caption"):
            parts.append(f"saw: {m['caption'][:200]}")
        if m.get("place"):
            parts.append(f"place: {m['place']}")
        lines.append(" | ".join(parts))
    return "\n".join(lines)


def _result(question: str, answer: str, spoken: str, sources: list[dict], grounded: bool) -> dict:
    ids = [m["_id"] for m in sources]
    summary = f'Answered "{question[:80]}"' if grounded else f'No memory supports an answer to "{question[:80]}"'
    rcp = receipts.create("answer", summary, ids if grounded else [])
    return {"answer": answer, "spoken": spoken, "grounded": grounded,
            "sources": [contract.moment(m) for m in sources] if grounded else [], "receipt_id": rcp["id"]}


def _promise_answer(question: str) -> dict | None:
    if not PROMISE_WORDS.search(question):
        return None
    people = network.mentioned_in(question)
    if len(people) != 1:
        return None
    person = people[0]
    items = promises.open_for(person["_id"])
    if re.search(r"\bpromis", question, re.I) and not re.search(r"\b(i|me)\b.*\bowe\b|\bi promised\b", question, re.I):
        items = [p for p in items if p["direction"] == "waiting_on"] or items
    if not items:
        return None
    company = f" from {person['company']}" if person.get("company") else ""
    lines = [brief_skill.promise_line(p, person) for p in items]
    first_line = lines[0].replace(person["name"].split()[0], f"{person['name']}{company}", 1)
    answer = ". ".join([first_line, *lines[1:]]) + "."
    spoken = lines[0] + "."
    sources = store.moments_by_ids([p["source_moment_id"] for p in items])
    return _result(question, answer, spoken, sources, True)


def ask(question: str, channel: str) -> dict:
    q = question.strip()

    m = BRIEF_RE.search(q)
    if m:
        person = network.find_by_name(m.group(1)) or next(iter(network.mentioned_in(m.group(1))), None)
        if person:
            b = brief_skill.brief(person["_id"])
            src = store.moments_by_ids([s["id"] for s in b["sources"]])
            return _result(q, b["spoken"], b["spoken"], src, True)

    direct = _promise_answer(q)
    if direct:
        return direct

    hits = search.search(q, limit=6)
    docs = [d for d, _ in hits]
    people = network.mentioned_in(q)
    open_p = [p for person in people for p in promises.open_for(person["_id"])]
    pmap = {p["_id"]: p for p in people}
    data = get_llm().answer(
        question=q, now_local=human(now()), moments=moments_block(docs) or "(none)",
        promises="\n".join(f"- {brief_skill.promise_line(p, pmap[p['person_id']])} [{p['source_moment_id']}]"
                           for p in open_p) or "(none)",
        people=", ".join(f"{p['name']} ({p.get('company') or 'unknown'})" for p in people) or "(none mentioned)")
    allowed = {d["_id"] for d in docs} | {p["source_moment_id"] for p in open_p}
    cited = [c for c in (data.get("citations") or []) if c in allowed]
    answer = (data.get("answer") or "").strip()
    if not data.get("grounded", True) or not cited or not answer:
        return _result(q, NO_ANSWER, NO_ANSWER, [], False)
    return _result(q, answer, (data.get("spoken") or answer).strip(), store.moments_by_ids(cited), True)
