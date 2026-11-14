"""Receipts: proof of what Cortex answered or did (kinds: answer, action, capture, deletion)."""
from datetime import datetime

from core import contract, db, events, tiger
from core.ids import new_id
from core.timeutil import now


def create(kind: str, summary: str, source_moment_ids: list[str], action_id: str | None = None,
           undo_until: datetime | None = None) -> dict:
    doc = {
        "_id": new_id("rcp"),
        "kind": kind,
        "created_at": now(),
        "summary": summary,
        "action_id": action_id,
        "source_moment_ids": list(dict.fromkeys(source_moment_ids)),
        "undo": {"available": undo_until is not None, "until": undo_until},
    }
    db.col("receipts").insert_one(doc)
    out = contract.receipt(doc)
    events.publish("receipt.created", out)
    tiger.log_action(tiger.USER, doc["created_at"], action_id, f"receipt.{kind}", "cortex", {"summary": summary})
    return out


def close_undo(action_id: str):
    db.col("receipts").update_many({"action_id": action_id, "undo.available": True},
                                   {"$set": {"undo.available": False}})


def list_all(limit: int = 100) -> list[dict]:
    return [contract.receipt(d) for d in db.col("receipts").find().sort("created_at", -1).limit(limit)]
