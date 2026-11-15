"""Pre-meeting brief (D-6): about 20 seconds spoken, three bullets, open promises and source moments.
The model writes it from stored data only; if its output is unusable a template built from the same data
is used, so the brief never fails on stage. Results are cached until that person's data changes."""
import logging

from core import contract, db
from core.llm import get_llm
from core.timeutil import human, human_date, now
from memory import store
from skills import network, promises

log = logging.getLogger(__name__)
_cache: dict[str, tuple[tuple, dict]] = {}


# Commitments are usually "send the deck" (a verb) but can be a thing ("Intro to the hiring manager"): "promised to
# intro to the hiring manager" is not a sentence, so a thing is written as "owes you: ...".
VERBS = frozenset("""send get give bring call email share pay push post finish submit review write make schedule introduce
text forward fix update check confirm book buy return drop set reply follow pick upload deliver prepare complete ask tell
show meet join pitch print sign mail move clean cook plan order pass connect loop sort resend look read take""".split())


def promise_line(p: dict, person: dict) -> str:
    first = person["name"].split()[0]
    what = p["what"][0].lower() + p["what"][1:]
    due = p.get("due") or {}
    when = f" by {human_date(due['date'])}" if due.get("date") else (f" ({due['text']})" if due.get("text") else "")
    verb = what.split()[0].lower() in VERBS
    if p["direction"] == "waiting_on":
        return f"{first} promised to {what}{when}" if verb else f"{first} owes you: {what}{when}"
    return f"You promised {first} to {what}{when}" if verb else f"You owe {first}: {what}{when}"


def _template(person: dict, moments: list[dict], open_p: list[dict]) -> dict:
    company = f", {person['company']}" if person.get("company") else ""
    intro = store.get_moment(person["introduced_moment_id"])
    met = f"You met {human(intro['ts'])}" if intro else "You have met"
    topics = person.get("topics") or []
    talked = f" and talked about {', '.join(topics[:2])}" if topics else ""
    spoken = f"{person['name']}{company}. {met}{talked}."
    if open_p:
        spoken += " " + "; ".join(promise_line(p, person) for p in open_p[:2]) + "; that is still open."
    else:
        spoken += " Nothing is open between you."
    bullets = [f"{person['name']}{company}; {met[4:] if met.startswith('You ') else met}",
               f"Talked about {', '.join(topics[:3])}" if topics else f"{len(moments)} moment(s) together",
               ("Open: " + promise_line(open_p[0], person)) if open_p else "Nothing open"]
    return {"spoken": spoken, "bullets": bullets}


def brief(person_id: str) -> dict:
    person = network.get(person_id)
    moments = store.moments_for_person(person_id)
    open_p = promises.open_for(person_id)
    key = (person.get("last_seen"), len(moments), tuple((p["_id"], p["status"]) for p in open_p),
           tuple(person.get("topics", [])))
    if person_id in _cache and _cache[person_id][0] == key:
        return _cache[person_id][1]

    from skills.ask import moments_block  # local import: ask imports this module

    company = f" from {person['company']}" if person.get("company") else ""
    data = get_llm().brief(
        name=person["name"], company=company, now_local=human(now()),
        card=f"{person['name']}, {person.get('company') or 'unknown company'}, role {person.get('role') or 'unknown'}, "
             f"topics {', '.join(person.get('topics', [])) or 'none'}",
        moments=moments_block(moments), promises="\n".join(f"- {promise_line(p, person)}" for p in open_p) or "(none)")
    spoken, bullets = (data.get("spoken") or "").strip(), [b for b in (data.get("bullets") or []) if b][:3]
    first = person["name"].split()[0].lower()
    if not spoken or first not in spoken.lower() or len(bullets) < 1:
        tpl = _template(person, moments, open_p)
        spoken, bullets = tpl["spoken"], tpl["bullets"]

    source_ids = [person["introduced_moment_id"], *[p["source_moment_id"] for p in open_p], *[m["_id"] for m in moments]]
    sources = store.moments_by_ids(list(dict.fromkeys(source_ids)))[:5]
    result = {
        "person": contract.person(person), "spoken": spoken, "bullets": bullets[:3],
        "open_promises": [contract.promise(p) for p in open_p],
        "sources": [contract.moment(m) for m in sources],
    }
    _cache[person_id] = (key, result)
    return result


def prewarm(person_id: str):
    """Build and cache a person's brief in the background so "brief me on <name>" answers at once."""
    try:
        brief(person_id)
    except Exception:  # noqa: BLE001 - a failed pre-warm must never break capture
        log.exception("brief pre-warm failed for %s", person_id)


def clear_cache():
    _cache.clear()


def warm_all():
    """Pre-compute briefs before going on stage (demo rule: pre-warm the brief)."""
    for p in db.col("people").find({}, {"_id": 1}):
        brief(p["_id"])
