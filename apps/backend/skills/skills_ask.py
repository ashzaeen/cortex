"""/ask routes for the skills: voice triggers from the glasses and the Ask box (checked before search).

- "Got it" / "I got the deck from Sam" -> closes the matching confirmed promise (WAI-7).
- "Who did I meet who works on ML?" -> contact search across cards (NET-5).
- "What is this?", "Is this a good price?" -> Ask the world on the glasses view (SKL-4).
- "Translate that to French: hello" / "How do you say thank you in German" -> Live translation (SKL-5).
- "Name things in Spanish" / "Quiz me" -> Language immersion (SKL-6).
- "Coach me through fixing a tap" -> a Coach session (SKL-8).
Anything that needs a view and has none answers "You don't have your glasses on." instead of guessing."""
import re

from core import db
from core.errors import ApiError
from memory import store
from skills import coach, immersion, people_search, promises, translate, world

GOT_IT = re.compile(r"^\s*(?:got it|i(?:'ve| have)? got(?: the| my)? ?(.*?)(?: from (\w+))?|(.+?) (?:arrived|came in|was sent))[.!]?\s*$", re.I)
WORLD = re.compile(r"\bwhat(?:'s| is| are) (?:this|that|these|those)\b|\bis this a good price\b|\bwhat plant\b|\bwhat does this error\b", re.I)
TRANSLATE = re.compile(r"\btranslate\b(?: (?:this|that))?(?: (?:to|into) (\w+))?[:,]?\s*(.*)$|\bhow do you say (.+?) in (\w+)\b", re.I)
NAME_THINGS = re.compile(r"\bname (?:things|objects|what i see) in (\w+)\b|\bteach me (\w+) words\b", re.I)
QUIZ = re.compile(r"\bquiz me\b", re.I)
COACH = re.compile(r"\bcoach me (?:through|on|with)\s+(.+?)[.?!]?$|\bwalk me through\s+(.+?)[.?!]?$", re.I)


def _got_it(q: str, result):
    m = GOT_IT.match(q)
    if not m:
        return None
    what = (m.group(1) or m.group(3) or "").strip().lower()
    who = (m.group(2) or "").strip().lower()
    open_ = [p for p in db.col("promises").find({"status": "confirmed", "direction": "waiting_on"})]
    scored = []
    for p in open_:
        person = db.col("people").find_one({"_id": p["person_id"]}) or {}
        score = (2 if who and who in (person.get("name_lower") or "") else 0) + sum(
            1 for w in re.findall(r"[a-z]{3,}", what) if w in p["what"].lower())
        if score:
            scored.append((score, p))
    if not what and not who:  # a bare "got it": only if exactly one thing is open
        scored = [(1, p) for p in open_] if len(open_) == 1 else []
    scored.sort(key=lambda s: -s[0])
    if not scored or (len(scored) > 1 and scored[0][0] == scored[1][0]):
        return None  # unsure: fall through rather than close the wrong thing
    done = promises.complete(scored[0][1]["_id"])
    msg = f"Marked done: {done['what']}."
    return result(q, msg, msg, store.moments_by_ids([done["source_moment_id"]]), True)


def _no_view(q: str, result, exc: ApiError):
    return result(q, exc.message, exc.message, [], False)


def route(q: str, channel: str, result):
    got = _got_it(q, result)
    if got:
        return got
    if people_search.wants(q):
        try:
            spoken, sources = people_search.answer(q)
        except ApiError:
            return None
        if not sources:  # no card matches: it may be a place or an event ("at the career fair"), so let memory search answer
            return None
        return result(q, spoken, spoken, sources, True)
    if WORLD.search(q):
        try:
            r = world.answer(q, source="glasses")
        except ApiError as exc:
            return _no_view(q, result, exc)
        src = store.moments_by_ids([r["moment"]["id"]]) if r["moment"] else []
        return result(q, r["text"], r["spoken"], src, not r["unsure"])
    m = TRANSLATE.search(q)
    if m:
        if m.group(3):
            text, target = m.group(3), m.group(4)
        else:
            text, target = m.group(2), m.group(1)
        if (text or "").strip():
            r = translate.translate(text, target=target)
            return result(q, r["translation"] or r["spoken"], r["spoken"], [], not r["unsure"])
    m = NAME_THINGS.search(q)
    if m:
        try:
            r = immersion.name_objects(m.group(1) or m.group(2), source="glasses")
        except ApiError as exc:
            return _no_view(q, result, exc)
        src = store.moments_by_ids([r["moment"]["id"]]) if r.get("moment") else []
        return result(q, r["text"], r["spoken"], src, bool(r["items"]))
    if QUIZ.search(q):
        try:
            qz = immersion.quiz()
        except ApiError as exc:
            return _no_view(q, result, exc)
        return result(q, qz["prompt"], qz["prompt"], [], True)
    m = COACH.search(q)
    if m:
        try:
            r = coach.start(m.group(1) or m.group(2), source="glasses")
        except ApiError as exc:
            return _no_view(q, result, exc)
        return result(q, r["text"], r["spoken"], [], True)
    return None

