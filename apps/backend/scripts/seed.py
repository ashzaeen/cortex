"""Load fixtures/*.json into the backend store (upsert by id, ids kept). Called by `make seed`.
  python -m scripts.seed           upsert fixtures
  python -m scripts.seed --reset   delete all backend data first (moments, people, promises, actions, receipts)"""
import json
import sys

from core import db, tiger
from core.config import REPO_ROOT
from core.llm import get_llm
from core.timeutil import now, parse_dt
from memory import store

FIX = REPO_ROOT / "fixtures"


def load(name: str) -> list[dict]:
    return json.loads((FIX / f"{name}.json").read_text(encoding="utf-8"))


def upsert(coll: str, doc: dict):
    db.col(coll).replace_one({"_id": doc["_id"]}, doc, upsert=True)


def seed(reset: bool = False) -> dict:
    db.init()
    tiger.init()
    if reset:
        db.reset()
    llm = get_llm()
    people = {p["id"]: p for p in load("people")}
    counts = {}

    for m in load("moments"):
        names = " ".join(people[p]["name"] + " " + (people[p].get("company") or "") for p in m["person_ids"]
                         if p in people)
        doc = {**{k: v for k, v in m.items() if k != "id"}, "_id": m["id"], "ts": parse_dt(m["ts"]),
               "embedding": llm.embed(" ".join(filter(None, [m.get("transcript"), m.get("caption"), m.get("place"),
                                                              names]))),
               "created_at": now()}
        upsert("moments", doc)
        tiger.delete_timeline([m["id"]])
        tiger.log_timeline(doc)
    counts["moments"] = len(load("moments"))

    for p in people.values():
        upsert("people", {**{k: v for k, v in p.items() if k != "id"}, "_id": p["id"],
                          "name_lower": p["name"].lower(), "first_lower": p["name"].lower().split()[0],
                          "created_at": now()})
    counts["people"] = len(people)

    for name, coll in (("promises", "promises"), ("actions", "actions")):
        items = load(name)
        for it in items:
            upsert(coll, {**{k: v for k, v in it.items() if k != "id"}, "_id": it["id"], "created_at": now()})
        counts[coll] = len(items)

    for r in load("receipts"):
        upsert("receipts", {**{k: v for k, v in r.items() if k != "id"}, "_id": r["id"],
                            "created_at": parse_dt(r["created_at"]),
                            "undo": {**r["undo"], "until": parse_dt(r["undo"]["until"])}})
    counts["receipts"] = len(load("receipts"))

    db.col("modes").delete_many({})
    store.ensure_modes()
    store.privacy()
    return counts


if __name__ == "__main__":
    result = seed(reset="--reset" in sys.argv)
    mode = "mock" if getattr(get_llm(), "is_mock", False) else "Gemini"
    store_kind = "in-memory MongoDB (set DATABASE_URL to persist)" if db.is_mock() else "MongoDB Atlas"
    print(f"seed: loaded {result} into {store_kind}; embeddings by {mode}; Tiger Data "
          f"{'on' if tiger.enabled() else 'off'}.")
