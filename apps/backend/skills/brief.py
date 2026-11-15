"""Pre-meeting brief (D-6): a headline, what you talked about last time (with a quote), open commitments with the
overdue ones first, a suggested opener, three bullets and a 25-word spoken version.
The model writes the wording from stored data only and every part is checked (a quote must be a substring of a
real moment, a moment id must exist); anything unusable falls back to a template built from the same data, so the
brief never fails on stage. Open commitments are never model output: they are computed. Cached until that
person's data changes."""
import logging
from datetime import date

from core import content, contract, db
from core.timeutil import human, human_date, now, tz
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


def _days_late(p: dict) -> int:
    """Whole days past a stated due date (0 when not overdue or no date). Vague dates are never overdue."""
    d = (p.get("due") or {}).get("date")
    if not d:
        return 0
    return max((now().astimezone(tz()).date() - date.fromisoformat(d)).days, 0)


def open_items(open_p: list[dict], person: dict) -> list[dict]:
    """Open commitments in both directions, overdue first then by due date, each already worded."""
    items = []
    for p in open_p:
        late = _days_late(p)
        due = p.get("due") or {}
        items.append({"promise_id": p["_id"], "text": promise_line(p, person), "direction": p["direction"],
                      "due_date": due.get("date"), "due_text": due.get("text"), "overdue": late > 0, "days_overdue": late,
                      "source_moment_id": p["source_moment_id"]})
    return sorted(items, key=lambda i: (not i["overdue"], i["due_date"] or "9999-12-31"))


def _gist(m: dict) -> str:
    return (m.get("transcript") or m.get("caption") or "").strip()


def _last_time(moments: list[dict]) -> dict | None:
    talked = [m for m in moments if _gist(m)]
    if not talked:
        return None
    m = talked[-1]
    said = (m.get("transcript") or "").strip()
    return {"when": human(m["ts"]), "where": m.get("place"), "gist": _gist(m)[:160], "moment_id": m["_id"],
            "quote": said if said and len(said) <= 160 else None}


def _thing(item: dict) -> str:
    """The commitment without who owes it: 'send the deck by Friday, Nov 20'."""
    return item["text"].split(": ", 1)[-1] if ": " in item["text"] else item["text"].split(" to ", 1)[-1]


def _template(person: dict, moments: list[dict], open_p: list[dict]) -> dict:
    """Everything the model would write, built from the stored data alone."""
    first = person["name"].split()[0]
    company = f", {person['company']}" if person.get("company") else ""
    items = open_items(open_p, person)
    last = _last_time(moments)
    topics = person.get("topics") or []
    top = items[0] if items else None
    if top:
        late = f" It is {top['days_overdue']} day{'s' if top['days_overdue'] != 1 else ''} overdue." if top["overdue"] else ""
        spoken = f"{person['name']}{company}. {top['text']}.{late}"
    elif last:
        spoken = f"{person['name']}{company}. You last spoke {last['when']}: {last['gist'][:90]}. Nothing is open between you."
    else:
        spoken = f"{person['name']}{company}. You have not talked yet, and nothing is open."
    bullets = [f"{person['name']}{company}" + (f", {person['role']}" if person.get("role") else ""),
               f"Last time ({last['when']}): {last['gist'][:80]}" if last else (
                   f"Talked about {', '.join(topics[:3])}" if topics else "No conversation yet"),
               top["text"] if top else "Nothing open"]
    if top:
        headline = f"{first}: {_thing(top)[:60]} is {'overdue' if top['overdue'] else 'open'}"
        opener = (f"Any news on {_thing(top)[:60]}?" if top["direction"] == "waiting_on"
                  else f"I wanted to follow up on {_thing(top)[:60]}.")
    else:
        headline = f"{person['name']}{company}"
        opener = f"Last time we talked about {topics[0]}. How is that going?" if topics else None
    return {"headline": headline[:90], "spoken": spoken, "bullets": bullets, "last_time": last, "opener": opener}


def _clean(data: dict, person: dict, moments: list[dict]) -> dict | None:
    """Keep only the model's parts that check out; None if the core (spoken, bullets) is unusable."""
    spoken = (data.get("spoken") or "").strip()
    bullets = [str(b).strip() for b in (data.get("bullets") or []) if str(b).strip()][:3]
    if not spoken or person["name"].split()[0].lower() not in spoken.lower() or not bullets:
        return None
    by_id = {m["_id"]: m for m in moments}
    lt = data.get("last_time") if isinstance(data.get("last_time"), dict) else None
    last = None
    if lt and lt.get("moment_id") in by_id and (lt.get("gist") or "").strip():
        m = by_id[lt["moment_id"]]
        quote = (lt.get("quote") or "").strip() or None
        if quote and quote.lower().strip(' "') not in (m.get("transcript") or "").lower():
            quote = None  # a quote must be real words from that moment
        last = {"when": (lt.get("when") or human(m["ts"])).strip()[:60], "where": m.get("place"),
                "gist": lt["gist"].strip()[:200], "moment_id": m["_id"], "quote": quote[:200] if quote else None}
    opener = (data.get("opener") or "").strip()
    return {"headline": (data.get("headline") or "").strip()[:90], "spoken": spoken, "bullets": bullets, "last_time": last,
            "opener": opener[:160] if len(opener) >= 8 else None}


def brief(person_id: str) -> dict:
    person = network.get(person_id)
    moments = store.moments_for_person(person_id)
    open_p = promises.open_for(person_id)
    key = (person.get("last_seen"), len(moments), tuple((p["_id"], p["status"]) for p in open_p),
           tuple(person.get("topics", [])), now().astimezone(tz()).date())
    if person_id in _cache and _cache[person_id][0] == key:
        return _cache[person_id][1]

    from skills.ask import moments_block  # local import: ask imports this module

    items = open_items(open_p, person)
    company = f" from {person['company']}" if person.get("company") else ""
    listed = [f"- {i['text']}" + (f" (OVERDUE by {i['days_overdue']} day{'s' if i['days_overdue'] != 1 else ''})"
                                  if i["overdue"] else "") for i in items]
    data = content.run(
        "brief", name=person["name"], company=company, now_local=human(now()),
        card=f"{person['name']}, {person.get('company') or 'unknown company'}, role {person.get('role') or 'unknown'}, "
             f"topics {', '.join(person.get('topics', [])) or 'none'}",
        moments=moments_block(moments), promises="\n".join(listed) or "(none)")
    out = _clean(data, person, moments) or _template(person, moments, open_p)
    tpl = None
    for k in ("headline", "last_time", "opener"):  # a model answer that lacks a part still gets the template's
        if not out.get(k):
            tpl = tpl or _template(person, moments, open_p)
            out[k] = tpl[k]

    source_ids = [out["last_time"]["moment_id"]] if out.get("last_time") else []
    source_ids += [person["introduced_moment_id"], *[p["source_moment_id"] for p in open_p], *[m["_id"] for m in moments]]
    sources = store.moments_by_ids(list(dict.fromkeys(source_ids)))[:5]
    result = {
        "person": contract.person(person), "spoken": out["spoken"], "bullets": out["bullets"][:3],
        "headline": out["headline"], "last_time": out["last_time"], "opener": out["opener"], "open": items,
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
