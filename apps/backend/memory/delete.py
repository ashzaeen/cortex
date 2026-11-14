"""DELETE /moments/{id} (T0-9): remove a moment and everything derived from it.

Removed: the moment (transcript, caption, embedding), its snapshot file, promises sourced from it, people
introduced by it (and their promises), its Tiger Data timeline row, and its id from other records.
Proposed or derived actions left with no source are deleted. Returns a deletion receipt."""
from core import db, events, receipts, snapshots, tiger
from core.errors import not_found


def delete_moment(moment_id: str) -> dict:
    doc = db.col("moments").find_one({"_id": moment_id})
    if not doc:
        raise not_found("moment")

    snap = snapshots.delete_url(doc.get("snapshot_url"))
    db.col("moments").delete_one({"_id": moment_id})
    n_promises = db.col("promises").delete_many({"source_moment_id": moment_id}).deleted_count

    people = [p["_id"] for p in db.col("people").find({"introduced_moment_id": moment_id}, {"_id": 1})]
    if people:
        n_promises += db.col("promises").delete_many({"person_id": {"$in": people}}).deleted_count
        db.col("people").delete_many({"_id": {"$in": people}})
        db.col("moments").update_many({}, {"$pull": {"person_ids": {"$in": people}}})
        db.col("actions").delete_many({"person_id": {"$in": people}, "status": "proposed"})

    db.col("actions").update_many({}, {"$pull": {"source_moment_ids": moment_id}})
    db.col("actions").delete_many({"source_moment_ids": {"$size": 0}})
    db.col("receipts").update_many({}, {"$pull": {"source_moment_ids": moment_id}})
    tiger.delete_timeline([moment_id])

    parts = ["transcript", "caption", "embedding"] + (["snapshot"] if snap or doc.get("snapshot_url") else [])
    summary = f"Deleted 1 moment and its {', '.join(parts[:-1])} and {parts[-1]}."
    if n_promises:
        summary += f" Also removed {n_promises} promise{'s' if n_promises != 1 else ''} derived from it."
    if people:
        summary += f" Removed {len(people)} contact card{'s' if len(people) != 1 else ''} created by this introduction."
    events.publish("moment.deleted", {"id": moment_id})
    return receipts.create("deletion", summary, [])
