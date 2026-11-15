"""Convert stored documents to the exact contract shapes (schemas use additionalProperties: false).
Storage keeps extra fields (embedding, created_at, timestamps as datetimes); these functions drop them."""
from core.timeutil import iso


def moment(doc: dict) -> dict:
    return {
        "id": doc["_id"],
        "ts": iso(doc["ts"]),
        "source": doc["source"],
        "mode": doc["mode"],
        "transcript": doc.get("transcript"),
        "caption": doc.get("caption"),
        "snapshot_url": doc.get("snapshot_url"),
        "video_url": doc.get("video_url"),
        "place": doc.get("place"),
        "person_ids": list(doc.get("person_ids", [])),
        "off_record": bool(doc.get("off_record", False)),
    }


def person(doc: dict) -> dict:
    return {
        "id": doc["_id"],
        "name": doc["name"],
        "company": doc.get("company"),
        "role": doc.get("role"),
        "consent": doc.get("consent", "introduction"),
        "introduced_moment_id": doc["introduced_moment_id"],
        "topics": list(doc.get("topics", [])),
        "notes": doc.get("notes"),
        "name_confidence": float(doc.get("name_confidence", 1.0)),
    }


def promise(doc: dict) -> dict:
    due = doc.get("due") or {}
    return {
        "id": doc["_id"],
        "direction": doc["direction"],
        "person_id": doc["person_id"],
        "what": doc["what"],
        "due": {"date": due.get("date"), "inferred": bool(due.get("inferred", False)), "text": due.get("text")},
        "status": doc["status"],
        "source_moment_id": doc["source_moment_id"],
    }


def action(doc: dict) -> dict:
    out = {
        "id": doc["_id"],
        "type": doc["type"],
        "status": doc["status"],
        "person_id": doc.get("person_id"),
        "source_moment_ids": list(doc.get("source_moment_ids", [])),
    }
    for k in ("mode", "title", "summary"):
        if doc.get(k):
            out[k] = doc[k]
    if doc["type"] == "follow_up_email":
        d = doc.get("draft") or {}
        out["draft"] = {"to": d.get("to", ""), "subject": d.get("subject", ""), "body": d.get("body", "")}
    for k in ("event", "task", "doc", "message"):
        if doc.get(k):
            out[k] = doc[k]
    if "external" in doc:
        out["external"] = doc["external"]
    return out


def receipt(doc: dict) -> dict:
    undo = doc.get("undo") or {}
    return {
        "id": doc["_id"],
        "kind": doc["kind"],
        "created_at": iso(doc["created_at"]),
        "summary": doc["summary"],
        "action_id": doc.get("action_id"),
        "source_moment_ids": list(doc.get("source_moment_ids", [])),
        "undo": {"available": bool(undo.get("available", False)), "until": iso(undo.get("until"))},
    }


def mode(doc: dict) -> dict:
    return {k: doc[k] for k in ("captures", "speaks", "proposes", "allowed_actions", "active")} | {
        "id": doc["_id"], "name": doc["name"]}
