"""Network skill (D-3): "This is Ash from Acme" -> contact card linked to the introduction moment.
Today people enter memory by introduction or an explicit add."""
import re
from datetime import datetime, timedelta

from core import contract, db, events
from core.config import settings
from core.errors import ApiError, not_found
from core.ids import new_id
from core.timeutil import now


def _slug_id(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:24] or "person"
    pid = f"per_{slug}"
    return pid if not db.col("people").find_one({"_id": pid}) else new_id("per")


_HONORIFIC = re.compile(r"^(?:dr|prof|professor|mr|mrs|ms|mx|miss|sir|coach)\.?$", re.I)


def given_name(name: str) -> str:
    """The name to use in a sentence: "Prof. Morgan Lee" -> Morgan, "Ash Kim" -> Ash."""
    words = name.split()
    while len(words) > 1 and _HONORIFIC.match(words[0]):
        words.pop(0)
    return words[0]


def find_by_name(name: str | None) -> dict | None:
    if not name:
        return None
    n = name.strip().lower()
    return db.col("people").find_one({"name_lower": n}) or db.col("people").find_one({"first_lower": n.split()[0]})


def mentioned_in(text: str) -> list[dict]:
    """People whose full or first name appears in the text (whole words)."""
    low = (text or "").lower()
    found = []
    for p in db.col("people").find():
        first = p.get("first_lower") or p["name_lower"].split()[0]
        if re.search(rf"\b{re.escape(p['name_lower'])}\b", low) or re.search(rf"\b{re.escape(first)}\b", low):
            found.append(p)
    return found


def get(person_id: str) -> dict:
    p = db.col("people").find_one({"_id": person_id})
    if not p:
        raise not_found("person")
    return p


def touch(person_id: str, at: datetime | None = None, topics: list[str] | None = None):
    upd = {"$set": {"last_seen": at or now()}}
    if topics:
        upd["$addToSet"] = {"topics": {"$each": [t for t in topics if t][:4]}}
    db.col("people").update_one({"_id": person_id}, upd)


def active_partner(at: datetime) -> dict | None:
    """The person the wearer is talking with: seen within PERSON_WINDOW_MINUTES."""
    since = at - timedelta(minutes=settings.person_window_minutes)
    return db.col("people").find_one({"last_seen": {"$gte": since}}, sort=[("last_seen", -1)])


def _new_doc(name: str, company: str | None, role: str | None, moment_id: str, consent: str,
             confidence: float) -> dict:
    name = name.strip()
    return {
        "_id": _slug_id(name), "name": name, "name_lower": name.lower(), "first_lower": name.lower().split()[0],
        "company": company or None, "role": role or None, "consent": consent, "introduced_moment_id": moment_id,
        "topics": [], "notes": None, "name_confidence": round(float(confidence), 2), "last_seen": now(),
        "created_at": now(),
    }


def from_introductions(items: list[dict], moment_id: str) -> tuple[list[dict], list[dict]]:
    """Returns (linked people, newly created people). Existing names are re-linked, not duplicated."""
    linked, created = [], []
    for it in items or []:
        name = (it.get("name") or "").strip()
        if not name or float(it.get("confidence") or 0) < 0.4:
            continue
        existing = find_by_name(name)
        if existing:
            if it.get("company") and not existing.get("company"):
                db.col("people").update_one({"_id": existing["_id"]}, {"$set": {"company": it["company"]}})
            touch(existing["_id"])
            linked.append(db.col("people").find_one({"_id": existing["_id"]}))
            continue
        doc = _new_doc(name, it.get("company"), it.get("role"), moment_id, "introduction",
                       it.get("confidence") or 0.9)
        db.col("people").insert_one(doc)
        linked.append(doc)
        created.append(doc)
    return linked, created


def announce(people: list[dict]):
    for p in people:
        events.publish("person.created", contract.person(p))


def announce_met_again(people: list[dict]):
    """A person introduced again links to their existing card; tell the dashboard (person.updated, #43)."""
    for p in people:
        events.publish("person.updated", contract.person(p))




def create_manual(name: str, company: str | None, introduced_moment_id: str) -> dict:
    """POST /people: add or correct a person by hand (e.g. fix a misheard name)."""
    if not db.col("moments").find_one({"_id": introduced_moment_id}):
        raise ApiError(400, "bad_request", "introduced_moment_id does not exist.")
    existing = db.col("people").find_one({"introduced_moment_id": introduced_moment_id}) or find_by_name(name)
    if existing:
        fields = {"name": name.strip(), "name_lower": name.strip().lower(), "first_lower": name.strip().lower().split()[0],
                  "name_confidence": 1.0}
        if company is not None:
            fields["company"] = company
        db.col("people").update_one({"_id": existing["_id"]}, {"$set": fields})
        doc = db.col("people").find_one({"_id": existing["_id"]})
    else:
        doc = _new_doc(name, company, None, introduced_moment_id, "explicit", 1.0)
        db.col("people").insert_one(doc)
        db.col("moments").update_one({"_id": introduced_moment_id}, {"$addToSet": {"person_ids": doc["_id"]}})
    events.publish("person.created", contract.person(doc))
    return contract.person(doc)


def update(person_id: str, fields: dict) -> dict:
    """PATCH /people/{id}: correct a card by hand. Only the fields sent change."""
    get(person_id)
    upd = {k: v for k, v in fields.items() if k in ("company", "role", "notes", "topics")}
    if "phone" in fields:
        phone = (fields["phone"] or "").strip().replace(" ", "")
        if phone and not re.fullmatch(r"\+[1-9][0-9]{6,14}", phone):
            raise ApiError(400, "bad_request",
                           "A phone number looks like +15555550123 (a plus, the country code, then the number).")
        upd["phone"] = phone or None
    name = (fields.get("name") or "").strip()
    if name:
        upd |= {"name": name, "name_lower": name.lower(), "first_lower": name.lower().split()[0],
                "name_confidence": 1.0}
    if upd:
        db.col("people").update_one({"_id": person_id}, {"$set": upd})
    doc = get(person_id)
    events.publish("person.updated", contract.person(doc))
    return contract.person(doc)


def delete(person_id: str) -> dict:
    """DELETE /people/{id}: remove the card and what was derived from it (its promises and proposed
    actions, its links on moments). The moments themselves stay; delete them separately."""
    from core import receipts

    p = get(person_id)
    n = db.col("promises").delete_many({"person_id": person_id}).deleted_count
    db.col("actions").delete_many({"person_id": person_id, "status": "proposed"})
    db.col("moments").update_many({"person_ids": person_id}, {"$pull": {"person_ids": person_id}})
    db.col("people").delete_one({"_id": person_id})
    events.publish("person.deleted", {"id": person_id})
    summary = f"Deleted the contact card for {p['name']}."
    if n:
        summary += f" Also removed {n} promise{'s' if n != 1 else ''} with them."
    return receipts.create("deletion", summary, [])


def list_all() -> list[dict]:
    return [contract.person(p) for p in db.col("people").find().sort("name_lower", 1)]
