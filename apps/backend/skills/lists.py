"""Lists (MEM-11): shopping and expenses, filled by voice and shown in the app.

"Add oat milk and batteries to the shopping list" -> two shopping items. "Log this receipt" or "I spent $12
on lunch" -> an expense (amount from the words, else from the snapshot caption). Parsing is deterministic
(demo-safe, no model call). Every voice item keeps its source moment, so deleting the moment deletes it.
Moments stored before this existed (the seeded profile) are scanned once, on first read."""
import re

from core import db, events
from core.errors import ApiError, not_found
from core.ids import new_id
from core.timeutil import iso, now

LISTS = {"shopping": "Shopping", "expenses": "Expenses"}

_SHOP = re.compile(r"\b(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my|the|our)?\s*(?:shopping|grocery|groceries)\s+list\b", re.I)
_EXPENSE = re.compile(r"\b(?:log|track|record|save|add)\b[^.?!]*\b(?:receipt|expense|expenses)\b|\bi\s+(?:just\s+)?spent\b",
                      re.I)
_AMOUNT = re.compile(r"\$\s?(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)\b", re.I)
_FOR = re.compile(r"\b(?:for|on|at)\s+(?:the\s+|a\s+|an\s+|my\s+)?([a-z][\w' -]{1,40}?)"
                  r"(?:[.?!,]|$|\s+(?:today|yesterday|just now))", re.I)


def out(doc: dict) -> dict:
    item = {"id": doc["_id"], "list": doc["list"], "text": doc["text"], "amount": doc.get("amount"),
            "done": bool(doc.get("done", False)), "source_moment_id": doc.get("source_moment_id"),
            "created_at": iso(doc["created_at"])}
    if doc.get("action_id"):
        item["action_id"] = doc["action_id"]  # the expense action that logged it (ACT-8), so its receipt can undo it
    return item


def _list_out(list_id: str) -> dict:
    items = [out(d) for d in db.col("list_items").find({"list": list_id}).sort("created_at", -1)]
    total = round(sum(i["amount"] or 0 for i in items), 2) if list_id == "expenses" else None
    return {"id": list_id, "name": LISTS[list_id], "items": items, "total": total}


def _check(list_id: str):
    if list_id not in LISTS:
        raise not_found("list")


def _split(items: str) -> list[str]:
    parts = re.split(r",\s*(?:and\s+)?|\s+and\s+|\s*&\s*", items.strip())
    return [re.sub(r"^(?:some|a|an|the|more)\s+", "", p.strip(" .,"), flags=re.I) for p in parts if p.strip(" .,")]


def _amount(*texts: str | None) -> float | None:
    for t in texts:
        m = _AMOUNT.search(t or "")
        if m:
            return round(float((m.group(1) or m.group(2)).replace(",", ".")), 2)
    return None


def parse(transcript: str | None, caption: str | None) -> list[tuple[str, str, float | None]]:
    """[(list, text, amount)] that a moment adds."""
    t = transcript or ""
    seen = re.split(r"(?<=[.!?])\s+", (caption or "").strip())[0].rstrip(".")  # first sentence of what was seen
    found = []
    m = _SHOP.search(t)
    if m:
        for item in _split(m.group(1)):
            if item.lower() in ("this", "that", "these", "those", "it", "them"):
                item = seen  # "add this to my shopping list" while looking at it
            if item:
                found.append(("shopping", item[:80], None))
    if _EXPENSE.search(t):
        what = _FOR.search(t)
        label = what.group(1).strip() if what else (seen or "Receipt")
        found.append(("expenses", label[:80], _amount(t, caption)))
    return found


def _insert(list_id: str, text: str, amount: float | None, source_moment_id: str | None, at=None,
            action_id: str | None = None) -> dict:
    doc = {"_id": new_id("itm"), "list": list_id, "text": text.strip(), "amount": amount, "done": False,
           "source_moment_id": source_moment_id, "created_at": at or now()}
    if action_id:
        doc["action_id"] = action_id
    db.col("list_items").insert_one(doc)
    return doc


def log_expense(label: str, amount: float | None, source_moment_id: str | None, action_id: str) -> dict:
    """What an approved expense action does (ACT-8): one entry on the Expenses list, linked to its action."""
    doc = _insert("expenses", label, amount, source_moment_id, action_id=action_id)
    events.publish("list.updated", _list_out("expenses"))
    return out(doc)


def _expense_action(moment: dict, label: str, amount: float | None) -> None:
    """"Log this receipt" is a request, so it runs at once (ACT-4: no confirmation), but as a real action: a receipt
    with the source moment and an undo, instead of a silent list write."""
    import logging

    from actions import doers, followup

    try:
        made = doers.propose({"type": "expense", "title": label, "mode": moment.get("mode"),
                              "source_moment_ids": [moment["_id"]], "expense": {"label": label, "amount": amount}})
        followup.confirm(made["id"], "do", None)
    except ApiError as exc:
        logging.getLogger(__name__).info("expense not logged: %s", exc.message)


def from_moment(moment: dict, publish: bool = True, as_actions: bool = False) -> list[dict]:
    """Called by ingest for every new moment. With as_actions, expenses become receipted, undoable actions."""
    docs = []
    for lst, text, amt in parse(moment.get("transcript"), moment.get("caption")):
        if lst == "expenses" and as_actions:
            _expense_action(moment, text, amt)
        else:
            docs.append(_insert(lst, text, amt, moment["_id"], moment.get("ts")))
    if publish:
        for list_id in dict.fromkeys(d["list"] for d in docs):
            events.publish("list.updated", _list_out(list_id))
    return docs


def ensure_backfilled():
    if db.col("state").find_one({"_id": "lists"}):
        return
    db.col("state").insert_one({"_id": "lists", "backfilled_at": now()})
    for m in db.col("moments").find({"transcript": {"$ne": None}}, {"embedding": 0}).sort("ts", 1):
        if not db.col("list_items").find_one({"source_moment_id": m["_id"]}):
            from_moment(m, publish=False)


def list_all() -> list[dict]:
    ensure_backfilled()
    return [_list_out(k) for k in LISTS]


def add(list_id: str, text: str, amount: float | None, source_moment_id: str | None) -> dict:
    _check(list_id)
    ensure_backfilled()
    if source_moment_id and not db.col("moments").find_one({"_id": source_moment_id}):
        raise ApiError(400, "bad_request", "source_moment_id does not exist.")
    doc = _insert(list_id, text, amount if list_id == "expenses" else None, source_moment_id)
    events.publish("list.updated", _list_out(list_id))
    return out(doc)


def _get(list_id: str, item_id: str) -> dict:
    _check(list_id)
    doc = db.col("list_items").find_one({"_id": item_id, "list": list_id})
    if not doc:
        raise not_found("list item")
    return doc


def update(list_id: str, item_id: str, fields: dict) -> dict:
    _get(list_id, item_id)
    fields = {k: v for k, v in fields.items() if v is not None}
    if list_id != "expenses":
        fields.pop("amount", None)
    if fields:
        db.col("list_items").update_one({"_id": item_id}, {"$set": fields})
        events.publish("list.updated", _list_out(list_id))
    return out(db.col("list_items").find_one({"_id": item_id}))


def remove(list_id: str, item_id: str) -> dict:
    doc = _get(list_id, item_id)
    db.col("list_items").delete_one({"_id": item_id})
    events.publish("list.updated", _list_out(list_id))
    return out(doc)


def delete_for_moment(moment_id: str) -> int:
    """Cascade delete (MEM-12): items a deleted moment added."""
    lists = {d["list"] for d in db.col("list_items").find({"source_moment_id": moment_id}, {"list": 1})}
    n = db.col("list_items").delete_many({"source_moment_id": moment_id}).deleted_count
    for list_id in lists:
        events.publish("list.updated", _list_out(list_id))
    return n


def spoken(list_id: str) -> str:
    lst = _list_out(list_id)
    open_items = [i for i in lst["items"] if not i["done"]]
    if not open_items:
        return f"Your {lst['name'].lower()} list is empty."
    if list_id == "expenses":
        return f"You logged {len(lst['items'])} expense{'s' if len(lst['items']) != 1 else ''}, ${lst['total']:.2f} in all."
    names = [i["text"] for i in open_items[:6]]
    joined = names[0] if len(names) == 1 else ", ".join(names[:-1]) + f" and {names[-1]}"
    return f"On your shopping list: {joined}."
