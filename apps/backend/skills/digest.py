"""Daily digest (MEM-9): an end-of-day recap of people met, promises, follow-ups and list items.

GET /digest?date=YYYY-MM-DD (default today in the user's timezone), and "what did I do today?" through
/ask. Built only from that day's stored records with a fixed template (no model call), so it is fast,
grounded and identical every rehearsal. Every bullet points back to its source moments."""
import re
from datetime import UTC, date, datetime, time, timedelta

from core import contract, db
from core.errors import ApiError
from core.timeutil import now, tz
from skills import brief as brief_skill

DIGEST_RE = re.compile(
    r"\b(what (?:did|have) i (?:do|done|been up to)|recap|digest|summar(?:y|ize|ise) (?:of )?my|how was my|"
    r"what happened)\b.*\b(today|yesterday|day|week)\b|\b(daily digest|day in review|end of day)\b", re.I)


def wants_digest(question: str) -> bool:
    return bool(DIGEST_RE.search(question or ""))


def day_for(question: str) -> date:
    local_today = now().astimezone(tz()).date()
    return local_today - timedelta(days=1) if re.search(r"\byesterday\b", question or "", re.I) else local_today


def _bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=tz()).astimezone(UTC)
    return start, start + timedelta(days=1)


def _label(day: date) -> str:
    today = now().astimezone(tz()).date()
    if day == today:
        return "today"
    if day == today - timedelta(days=1):
        return "yesterday"
    return f"on {day.strftime('%A, %b')} {day.day}"


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + f" and {names[-1]}"


def _who(p: dict) -> str:
    return f"{p['name']} from {p['company']}" if p.get("company") else p["name"]


def parse_day(value: str | None) -> date:
    if not value:
        return now().astimezone(tz()).date()
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(400, "bad_request", "date must be YYYY-MM-DD.") from exc


def digest(day: date | None = None) -> dict:
    day = day or now().astimezone(tz()).date()
    start, end = _bounds(day)
    when = _label(day)
    moments = list(db.col("moments").find({"ts": {"$gte": start, "$lt": end}}, {"embedding": 0}).sort("ts", 1))
    ids = [m["_id"] for m in moments]
    idset = set(ids)

    person_ids = list(dict.fromkeys(pid for m in moments for pid in m.get("person_ids", [])))
    people = {p["_id"]: p for p in db.col("people").find({"_id": {"$in": person_ids}})}
    met = [people[i] for i in person_ids if i in people and people[i].get("introduced_moment_id") in idset]
    saw = [people[i] for i in person_ids if i in people and people[i] not in met]

    proms = [p for p in db.col("promises").find({"source_moment_id": {"$in": ids}}).sort("created_at", 1)
             if p["status"] != "dismissed"]
    all_people = {p["_id"]: p for p in db.col("people").find({"_id": {"$in": [p["person_id"] for p in proms]}})}
    proms = [p for p in proms if p["person_id"] in all_people]

    acts = [a for a in db.col("actions").find({"created_at": {"$gte": start, "$lt": end}}).sort("created_at", 1)]
    acts += [a for a in db.col("actions").find({"source_moment_ids": {"$in": ids}})
             if a["_id"] not in {x["_id"] for x in acts}]
    done = [a for a in acts if a["status"] in ("sent", "draft_saved", "done")]
    waiting = [a for a in acts if a["status"] == "proposed"]

    items = list(db.col("list_items").find({"source_moment_id": {"$in": ids}}).sort("created_at", 1))
    shopping = [i["text"] for i in items if i["list"] == "shopping"]
    expenses = [i for i in items if i["list"] == "expenses"]

    if not moments:
        spoken = f"I don't have anything from {when} in memory."
        return {"date": day.isoformat(), "spoken": spoken, "bullets": [], "moment_count": 0, "people": [],
                "promises": [], "actions": [], "source_moment_ids": []}

    bullets: list[str] = []
    n = len(moments)
    modes = list(dict.fromkeys(m.get("mode") for m in moments if m.get("mode")))
    across = f" across {_join(modes)} mode{'s' if len(modes) > 1 else ''}" if modes else ""
    lead = f"{when[0].upper()}{when[1:]} you captured {n} moment{'s' if n != 1 else ''}{across}."
    if met:
        bullets.append(f"Met {_join([_who(p) for p in met])}")
    if saw:
        bullets.append(f"Saw {_join([p['name'] for p in saw])} again")
    for p in proms[:4]:
        bullets.append(brief_skill.promise_line(p, all_people[p["person_id"]]))
    if done:
        bullets.append(f"Cortex finished {len(done)} follow-up{'s' if len(done) != 1 else ''}"
                       f" ({_join([a.get('title') or a['type'].replace('_', ' ') for a in done[:3]])})")
    if waiting:
        bullets.append(f"{len(waiting)} suggestion{'s are' if len(waiting) != 1 else ' is'} waiting for you")
    if shopping:
        bullets.append(f"Added {_join(shopping)} to your shopping list")
    if expenses:
        total = sum(e.get("amount") or 0 for e in expenses)
        bullets.append(f"Logged {len(expenses)} expense{'s' if len(expenses) != 1 else ''}"
                       + (f", ${total:.2f}" if total else ""))
    if not bullets:  # nothing structured: quote the first notes so the recap still says something
        notes = [m["transcript"] for m in moments if m.get("transcript")][:2]
        bullets += [f'Noted: "{t[:120]}"' for t in notes] or [f"Saw: {moments[0].get('caption') or 'a snapshot'}"]

    spoken = " ".join([lead, *[b.rstrip(".") + "." for b in bullets[:5]]])
    src = [p["introduced_moment_id"] for p in met] + [p["source_moment_id"] for p in proms]
    src += [i for a in acts for i in a.get("source_moment_ids", []) if i in idset]
    src += [i["source_moment_id"] for i in items]
    src = list(dict.fromkeys(src)) or ids[-3:]
    return {
        "date": day.isoformat(), "spoken": spoken, "bullets": bullets, "moment_count": n,
        "people": [contract.person(p) for p in met + saw],
        "promises": [contract.promise(p) for p in proms],
        "actions": [contract.action(a) for a in acts],
        "source_moment_ids": src,
    }
