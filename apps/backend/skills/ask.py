"""Ask with proof (D-5). Answers ONLY from retrieved moments; otherwise grounded=false. Every answer
writes a receipt (kind answer) and returns its source moments.

Order: 0) rewind ("replay what Ash said", MEM-10), the daily digest ("what did I do today?", MEM-9) and
lists ("what's on my shopping list?", MEM-11), all built from stored records; 1) "brief me on <name>" -> the
brief; 2) questions about a known person's promises ("What did Ash
promise me?", "What is open with Ash?") -> answered straight from the promises table with their source
moments (deterministic, demo-safe); 3) anything else -> search + Gemini, citations checked against hits."""
import re

from core import contract, receipts
from core.llm import get_llm
from core.timeutil import human, now
from memory import search, store
from skills import brief as brief_skill
from skills import digest as digest_skill
from skills import lists as lists_skill
from skills import network, promises
from skills import rewind as rewind_skill

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


LIST_RE = re.compile(r"\b(?:what(?:'s| is)|read|tell me)\b.*\b(shopping|grocery|groceries|expense|expenses|spent|spending)\b",
                     re.I)


def _digest_answer(q: str) -> dict:
    d = digest_skill.digest(digest_skill.day_for(q))
    if not d["moment_count"]:
        return _result(q, d["spoken"], d["spoken"], [], False)
    answer = "; ".join(d["bullets"]) + "." if d["bullets"] else d["spoken"]
    return _result(q, answer, d["spoken"], store.moments_by_ids(d["source_moment_ids"]), True)


def _rewind_answer(q: str) -> dict:
    r = rewind_skill.rewind(q)
    if not r["found"]:
        return _result(q, NO_ANSWER, NO_ANSWER, [], False)
    return _result(q, r["spoken"], r["spoken"], store.moments_by_ids([r["moment"]["id"]]), True)


def _list_answer(q: str) -> dict | None:
    m = LIST_RE.search(q)
    if not m:
        return None
    list_id = "shopping" if m.group(1).lower().startswith(("shop", "groc")) else "expenses"
    lst = next(x for x in lists_skill.list_all() if x["id"] == list_id)
    sources = [i["source_moment_id"] for i in lst["items"] if i["source_moment_id"]]
    spoken = lists_skill.spoken(list_id)
    # Items added by hand have no source moment; the list itself is the record.
    return _result(q, spoken, spoken, store.moments_by_ids(sources), bool(lst["items"]))


def ask(question: str, channel: str) -> dict:
    q = question.strip()

    if rewind_skill.wants_rewind(q):
        return _rewind_answer(q)
    if digest_skill.wants_digest(q):
        return _digest_answer(q)
    listed = _list_answer(q)
    if listed:
        return listed

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
