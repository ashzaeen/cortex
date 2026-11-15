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


WHO_MET_RE = re.compile(r"\bwho\b.{0,20}?\b(?:did i meet|have i met|do i know|was i introduced to)\b(.*)$", re.I)
_FILLER = re.compile(r"\b(?:who|that|which|works?|working|worked|on|at|for|from|about|in|with|is|are|was|were|a|an|the|and|or|"
                     r"of|today|yesterday|recently|earlier|also|does|do|did|i|me|my|met|meet|know|people|person|someone|"
                     r"anyone|there)\b", re.I)


def _people_answer(q: str) -> dict | None:
    """NET-5 contact search: "Who did I meet who works on ML?" is answered from the contact cards."""
    m = WHO_MET_RE.search(q)
    if not m:
        return None
    terms = [t for t in re.findall(r"[a-z0-9+#.]+", _FILLER.sub(" ", m.group(1).lower())) if len(t) > 1]
    found = network.search(terms) if terms else []
    if not found:
        return None
    parts = [f"{p['name']} from {p['company']}" if p.get("company") else p["name"] for p in found[:3]]
    answer = "You met " + ", ".join(parts[:-1]) + (" and " if len(parts) > 1 else "") + parts[-1] + "."
    topics = [t for p in found[:1] for t in p.get("topics", [])[:2]]
    if topics:
        answer += f" {found[0]['name'].split()[0]} talked about {' and '.join(topics)}."
    sources = store.moments_by_ids([p["introduced_moment_id"] for p in found[:3]])
    return _result(q, answer, answer, sources, True)


CLOSE_RE = re.compile(r"\b(got (?:it|the \w+|that)|(?:has |have )?(?:sent|delivered|gave|shared) (?:me|it|the \w+)|received|"
                      r"(?:mark|close|check off|tick off)\b.*\b(?:done|promise|complete\w*)|done with|that(?:'s| is) done)\b",
                      re.I)
QUESTION_START = re.compile(
    r"\s*(?:what|when|who|where|why|how|did|does|do|is|are|was|were|have|has|can|could|brief|replay|rewind)\b", re.I)


_STOP = {"the", "and", "you", "your", "for", "from", "got", "with", "that", "this", "send", "sent", "have", "has", "had",
         "mark", "done", "close", "promise", "promised", "check", "tick", "off", "gave", "shared", "received", "delivered",
         "complete", "completed", "his", "her", "their", "its", "was", "just", "now", "one", "all"}


def _content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{3,}", text.lower())} - _STOP


def _close_answer(q: str) -> dict | None:
    """WAI-7 close-out by words: "Got the deck from Ash" or "Mark Ash's promise done" closes that open promise."""
    if QUESTION_START.match(q) or q.rstrip().endswith("?") or not CLOSE_RE.search(q):
        return None
    people = network.mentioned_in(q)
    if len(people) != 1:
        return None
    person = people[0]
    items = promises.open_for(person["_id"])
    if not items:
        return None
    words = _content_words(q) - _content_words(person["name"])
    match = [p for p in items if words & _content_words(p["what"])]
    pick = match if len(match) == 1 else (items if len(items) == 1 else [])
    if not pick:
        names = "; ".join(brief_skill.promise_line(p, person) for p in items)
        msg = f"{person['name']} has {len(items)} open items: {names}. Say which one is done."
        return _result(q, msg, msg, store.moments_by_ids([p["source_moment_id"] for p in items]), True)
    done = promises.close(pick[0]["_id"])
    brief_skill.prewarm(person["_id"])
    line = brief_skill.promise_line(done, person)
    msg = f"Marked done: {line[0].lower() + line[1:]}."
    return _result(q, msg, msg, store.moments_by_ids([done["source_moment_id"]]), True)


OVERDUE_RE = re.compile(r"\b(overdue|past due|running late|behind on|late on)\b", re.I)


def _overdue_answer(q: str) -> dict | None:
    """WAI-5, pull version: "What is overdue?" lists open promises past their due date."""
    asked = bool(QUESTION_START.match(q)) or q.rstrip().endswith("?")
    if not OVERDUE_RE.search(q) or not asked:
        return None
    late = promises.overdue()
    if not late:
        msg = "Nothing is overdue."
        return _result(q, msg, msg, [], True)
    people = {p["_id"]: p for p in network.list_raw()}
    lines = [brief_skill.promise_line(p, people[p["person_id"]]) + " (overdue)" for p in late if p["person_id"] in people]
    spoken = lines[0] + (f", and {len(lines) - 1} more" if len(lines) > 1 else "") + "."
    return _result(q, ". ".join(lines) + ".", spoken, store.moments_by_ids([p["source_moment_id"] for p in late]), True)


def ask(question: str, channel: str) -> dict:
    q = question.strip()

    if rewind_skill.wants_rewind(q):
        return _rewind_answer(q)
    if digest_skill.wants_digest(q):
        return _digest_answer(q)
    listed = _list_answer(q)
    if listed:
        return listed
    for handler in (_close_answer, _people_answer, _overdue_answer):
        found = handler(q)
        if found:
            return found

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
