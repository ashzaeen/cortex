"""/ask routes for the modes (checked before search, all built from stored records or the live view):

- "Switch to Student mode" -> switch, spoken label (MODE-2 voice). "Yes" while a mode is suggested -> switch.
- "Recap the meeting", "Summarize the lecture", "What are my action items?" -> skills/recap (FOC-1, FOC-2, STU-1).
- "What did we decide?" -> decision-tagged moments (FOC-5).
- "What did I promise?" / "What do I owe?" with no one named -> every open i_owe promise (FOC-4).
- "What time is my next medicine reminder?" -> routines (AST-5).
- "What's in front of me?", "Read this", "Where is the door?" -> /look on the newest view (AST-1 to AST-3)."""
import re

from core import db
from core.errors import ApiError
from memory import store
from skills import look, modes, network, recap, routines
from skills.brief import promise_line

YES = re.compile(r"^\s*(?:yes|yeah|yep|sure|ok(?:ay)?|do it|switch)(?: please)?[.!]?\s*$", re.I)
RECAP = re.compile(r"\b(?:recap|summari[sz]e|sum up)\b.*\b(meeting|lecture|class|call|session)\b"
                   r"|\b(?:meeting|lecture) (?:recap|notes|summary)\b"
                   r"|\b(?:live|lecture|class) notes\b|\baction items?\b|\bwhat (?:are|were) my (?:to-?dos|tasks)\b", re.I)
DECIDE = re.compile(r"\bwhat did we (?:decide|agree)\b|\b(?:our|the) decisions?\b|\bdecision log\b", re.I)
OWE = re.compile(r"\bwhat (?:did|have) i promised?\b|\bwhat do i owe\b|\bmy promises\b|\bwhat i owe\b", re.I)
ROUTINE = re.compile(r"\b(?:next|upcoming)\b.*\b(?:reminder|routine|medicine|medication|pill)s?\b|\bmy routine\b", re.I)
LOOKS = [
    (re.compile(r"\bwhat(?:'s| is) (?:in front of|around) me\b|\bdescribe (?:the scene|what you see|this)\b", re.I),
     "describe", None),
    (re.compile(r"\bread (?:this|that|the (?:sign|label|menu|text|page))\b", re.I), "read", None),
    (re.compile(r"\bwhere(?:'s| is) the (door|exit|stairs|step|chair|elevator|crosswalk)\b", re.I), "hazards", 1),
    (re.compile(r"\b(?:help me (?:with|solve) this|explain this (?:problem|circuit|question)|tutor me)\b", re.I), "tutor", None),
]


def route(q: str, channel: str, result):
    """An answer dict, or None to fall through to the other /ask routes. result is skills.ask._result."""
    wanted = modes.switch_command(q)
    if wanted:
        modes.activate(wanted)
        return result(q, f"{modes.name_of(wanted)} mode is on.", modes.spoken_label(wanted), [], True)
    pending = modes.pending()
    if pending and YES.match(q):
        modes.activate(pending["mode_id"])
        src = store.moments_by_ids([pending["moment_id"]]) if pending.get("moment_id") else []
        return result(q, f"Switched to {modes.name_of(pending['mode_id'])} mode.", modes.spoken_label(pending["mode_id"]),
                      src, True)

    if RECAP.search(q):
        kind = "lecture" if re.search(r"\b(lecture|class|live notes)\b", q, re.I) else "meeting"
        r = recap.recap(None, kind)
        if not r["moment_count"]:
            return result(q, r["spoken"], r["spoken"], [], False)
        if re.search(r"\baction items?\b|\bto-?dos\b|\btasks\b", q, re.I):
            items = r["follow_ups"]
            if not items:
                return result(q, "No action items in your last session.", "No action items in your last session.",
                              store.moments_by_ids(r["source_moment_ids"][-1:]), True)
            text = "; ".join(f["text"] for f in items)
            plural = "s" if len(items) != 1 else ""
            return result(q, f"Action items: {text}.", f"{len(items)} action item{plural}: {items[0]['text']}.",
                          store.moments_by_ids(list(dict.fromkeys(f["moment_id"] for f in items))), True)
        return result(q, r["spoken"] + (" " + "; ".join(r["bullets"]) + "." if r["bullets"] else ""), r["spoken"],
                      store.moments_by_ids(r["source_moment_ids"]), True)

    if DECIDE.search(q):
        docs = list(db.col("moments").find({"tags": "decision"}, {"embedding": 0}).sort("ts", -1).limit(5))
        if not docs:
            return result(q, "I don't have any decisions in memory.", "I don't have any decisions in memory.", [], False)
        lines = [(d.get("transcript") or "").strip() for d in docs]
        return result(q, "Decisions: " + " | ".join(lines), f"Latest decision: {lines[0]}", docs, True)

    if OWE.search(q) and not network.mentioned_in(q):
        items = list(db.col("promises").find({"direction": "i_owe", "status": {"$in": ["proposed", "confirmed"]}}))
        if not items:
            return result(q, "You don't owe anyone anything right now.", "You don't owe anyone anything right now.", [], False)
        people = {p["_id"]: p for p in db.col("people").find({"_id": {"$in": [i["person_id"] for i in items]}})}
        lines = [promise_line(p, people[p["person_id"]]) if p["person_id"] in people else p["what"] for p in items]
        return result(q, ". ".join(lines) + ".", f"You owe {len(items)}: {lines[0]}.",
                      store.moments_by_ids([i["source_moment_id"] for i in items]), True)

    if ROUTINE.search(q):
        r = routines.next_matching(q)
        if not r:
            return result(q, "You have no routine reminders set.", "You have no routine reminders set.", [], False)
        from core.timeutil import human, parse_dt

        when = human(parse_dt(r["next_at"]))
        text = f"Your next reminder is {r['title']}, {when}."
        # A routine is set by the user, not captured, so it has no source moment; the routine is the record.
        return result(q, text, text, [], True)

    for rx, task, group in LOOKS:
        m = rx.search(q)
        if m:
            try:
                seen = look.look(task, target=m.group(group) if group else None, question=q)
            except ApiError as exc:
                return result(q, exc.message, exc.message, [], False)
            src = store.moments_by_ids([seen["moment"]["id"]]) if seen.get("moment") else []
            return result(q, seen["text"], seen["spoken"], src, bool(src))
    return None
