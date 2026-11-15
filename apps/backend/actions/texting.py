"""A text to a contact, proposed from their card or by voice (ACT-9). Nothing is sent until the yes.

The text is drafted from what is open with them (the newest open promise either way), else a short hello, so the
wearer sees exactly what would go out and can edit it. It goes to the phone on the card; with no phone the
proposal is refused and says how to fix that. Delivery and undo are the message action's own (actions/doers.py):
held for the undo window, then sent through the Chert line to a verified phone."""
from actions import doers
from core import contract, db
from core.errors import ApiError
from memory import store
from skills import network, promises


def draft_text(person: dict, open_promises: list[dict]) -> str:
    first = network.given_name(person["name"])
    if open_promises:
        p = open_promises[0]
        what = p["what"].rstrip(".")
        low = what[0].lower() + what[1:] if what[:1].isupper() and not what.split()[0].isupper() else what
        if p["direction"] == "waiting_on":
            return f"Hi {first}, just checking in on {low}. Let me know when it's ready."
        return f"Hi {first}, a quick note on {low}: I'll get it to you soon."
    return f"Hi {first}, great to meet you. Talk soon."


def propose_for_person(person_id: str, text: str | None = None, source_moment_ids: list[str] | None = None,
                       mode: str | None = None) -> dict:
    person = network.get(person_id)
    first = network.given_name(person["name"])
    if not person.get("phone"):
        raise ApiError(400, "no_phone", f"I don't have a number for {first}. Add one on their card, then try again.")
    if not (text or "").strip():  # a second tap on "Text Ash" shows the one already waiting
        waiting = db.col("actions").find_one({"person_id": person_id, "type": "message", "status": "proposed"})
        if waiting:
            return contract.action(waiting)
    open_p = promises.open_for(person_id)
    ids = [i for i in (source_moment_ids or []) if store.get_moment(i)]
    if not ids:
        ids = [person["introduced_moment_id"], *[p["source_moment_id"] for p in open_p]]
        ids = [i for i in dict.fromkeys(ids) if store.get_moment(i)]
    if not ids:
        raise ApiError(400, "bad_request", "No source moments found for this person.")
    body = (text or "").strip() or draft_text(person, open_p)
    return doers.propose({
        "type": "message", "title": f"Text {first}", "person_id": person_id, "source_moment_ids": ids,
        "mode": mode or store.active_mode(), "summary": f"To {first}: \u201c{body}\u201d",
        "message": {"to": person["phone"], "text": body[:4000]}})
