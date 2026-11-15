"""Load fixtures/*.json into the backend store (upsert by id, ids kept). Called by `make seed`.
  python -m scripts.seed           upsert fixtures
  python -m scripts.seed --reset   delete all backend data first (moments, people, promises, actions, receipts)

seed_profile() gives a signed-in user their own copy of the demo profile (apps/dashboard/demo), with every
date moved so the profile's last day is today, as the /demo page does (core/user.py calls it)."""
import hashlib
import json
import sys
from datetime import date, timedelta

from core import db, tiger
from core.config import REPO_ROOT
from core.llm import get_llm
from core.timeutil import now, parse_dt
from memory import store

FIX = REPO_ROOT / "fixtures"
PROFILE = REPO_ROOT / "apps" / "dashboard" / "demo"
PROFILE_ANCHOR = date(2026, 11, 15)  # the profile's "today" (apps/dashboard/mock/profile.mjs ANCHOR)

_src = FIX


def load(name: str) -> list[dict]:
    return json.loads((_src / f"{name}.json").read_text(encoding="utf-8"))


def _embed(llm, text: str) -> list[float]:
    """Embeddings for seed text are cached across users, so each new user costs no model calls."""
    key = hashlib.sha256(f"{getattr(llm, 'is_mock', False)}|{text}".encode()).hexdigest()
    cache = db.shared("embed_cache")
    hit = cache.find_one({"_id": key})
    if hit:
        return hit["v"]
    vec = llm.embed(text)
    cache.replace_one({"_id": key}, {"_id": key, "v": vec}, upsert=True)
    return vec


def _extras() -> dict:
    """Optional extras.json beside the other profile files: routines, the caregiver, immersion words, coach sessions."""
    path = _src / "extras.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def upsert(coll: str, doc: dict):
    db.own(coll).replace_one({"_id": doc["_id"]}, doc, upsert=True)


def _profile_delta(moments: list[dict]) -> timedelta:
    """Whole days that move PROFILE_ANCHOR to today, stepped back so no moment lands in the future."""
    delta = timedelta(days=(now().date() - PROFILE_ANCHOR).days)
    newest = max(parse_dt(m["ts"]) for m in moments)
    while newest + delta > now():
        delta -= timedelta(days=1)
    return delta


def seed_profile() -> dict:
    """The current user's own copy of the demo profile. Marks the database so it happens only once."""
    global _src
    _src, before = PROFILE, _src
    try:
        delta = _profile_delta(load("moments"))
        counts = seed(shift=delta)
    finally:
        _src = before
    db.col("state").replace_one({"_id": "profile"}, {"_id": "profile", "seeded_at": now(), "anchor_shift_days":
                                                      delta.days}, upsert=True)
    return counts


def seed(reset: bool = False, shift: timedelta | None = None) -> dict:
    if db._db is None:  # inside a running server the store is already up; re-init would drop it
        db.init()
        tiger.init()
    if reset:
        db.reset()
    llm = get_llm()
    people = {p["id"]: p for p in load("people")}
    counts = {}
    move = (lambda dt: dt + shift) if shift else (lambda dt: dt)

    def move_date(d: str | None) -> str | None:
        return (date.fromisoformat(d) + shift).isoformat() if d and shift else d

    for m in load("moments"):
        names = " ".join(people[p]["name"] + " " + (people[p].get("company") or "") for p in m["person_ids"]
                         if p in people)
        doc = {**{k: v for k, v in m.items() if k != "id"}, "_id": m["id"], "ts": move(parse_dt(m["ts"])),
               "embedding": _embed(llm, " ".join(filter(None, [m.get("transcript"), m.get("caption"),
                                                                m.get("place"), names]))),
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
            doc = {**{k: v for k, v in it.items() if k != "id"}, "_id": it["id"], "created_at": now()}
            if coll == "promises" and isinstance(doc.get("due"), dict):
                doc["due"] = {**doc["due"], "date": move_date(doc["due"].get("date"))}
            upsert(coll, doc)
        counts[coll] = len(items)

    for r in load("receipts"):
        until = parse_dt(r["undo"]["until"])
        upsert("receipts", {**{k: v for k, v in r.items() if k != "id"}, "_id": r["id"],
                            "created_at": move(parse_dt(r["created_at"])),
                            "undo": {**r["undo"], "until": move(until) if until else None}})
    counts["receipts"] = len(load("receipts"))

    extras = _extras()
    if extras.get("lists"):  # list items the spoken moments do not already produce (the backfill runs first, so no duplicates)
        from skills import lists

        lists.ensure_backfilled()
        for list_id, items in extras["lists"].items():
            have = {d["text"].lower() for d in db.col("list_items").find({"list": list_id})}
            for it in items:
                if it["text"].lower() not in have:
                    src = db.col("moments").find_one({"_id": it.get("source_moment_id")}, {"ts": 1})
                    lists._insert(list_id, it["text"], it.get("amount"), it.get("source_moment_id"), src["ts"] if src else None)
    for r in extras.get("routines", []):
        upsert("routines", {**{k: v for k, v in r.items() if k != "id"}, "_id": r["id"], "created_at": now(), "last_fired": None})
    for v in extras.get("vocab", []):
        upsert("vocab", {**{k: v2 for k, v2 in v.items() if k != "id"}, "_id": v["id"], "created_at": now()})
    for c in extras.get("coach_sessions", []):
        upsert("coach_sessions", {**{k: v for k, v in c.items() if k != "id"}, "_id": c["id"],
                                  "created_at": move(parse_dt(c["created_at"])), "updated_at": now()})
    if extras.get("caregiver"):  # the person is set up but has NOT consented: nothing is ever sent from seed data
        caregiver = {"name": None, "email": None, "send_at": "20:00", **extras["caregiver"]}
        caregiver["consent"] = False
        db.col("state").replace_one({"_id": "caregiver"}, {"_id": "caregiver", **caregiver}, upsert=True)
    counts.update({k: len(extras.get(k, [])) for k in ("routines", "vocab", "coach_sessions")})

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
