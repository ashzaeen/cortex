"""A signed-in user's view of memory: their own database plus the shared default memory.

The shared memory holds whatever arrives without X-Cortex-User (the glasses app or call agent before they
send the wearer's email). Every signed-in user sees it, minus the test fixtures (fixtures/*.json), which
stay with the default user only. Inserts go to the user's own database, so what they add stays private;
updates and deletes reach a shared document only when the user has no matching document of their own
(the shared memory is shared, so changing it changes it for everyone)."""
import json
from functools import cache

from core.config import REPO_ROOT

MERGED = {"moments", "people", "promises", "actions", "receipts", "drafts", "snapshots", "videos", "video_chunks"}
_FIXTURE_FILES = {"moments": "moments", "people": "people", "promises": "promises", "actions": "actions",
                  "receipts": "receipts"}


@cache
def hidden_ids(name: str) -> frozenset:
    """Fixture ids that never show through from the shared memory."""
    f = _FIXTURE_FILES.get(name)
    if not f:
        return frozenset()
    path = REPO_ROOT / "fixtures" / f"{f}.json"
    return frozenset(x["id"] for x in json.loads(path.read_text(encoding="utf-8"))) if path.exists() else frozenset()


def _sort_spec(key, direction=None):
    if isinstance(key, list):
        return key
    return [(key, direction if direction is not None else 1)]


class _Cursor:
    def __init__(self, load):
        self._load, self._sort, self._limit = load, None, 0

    def sort(self, key, direction=None):
        self._sort = _sort_spec(key, direction)
        return self

    def limit(self, n):
        self._limit = int(n or 0)
        return self

    def _rows(self):
        rows = self._load()
        for field, d in reversed(self._sort or []):
            present = [r for r in rows if r.get(field) is not None]
            missing = [r for r in rows if r.get(field) is None]
            rows = sorted(present, key=lambda r: r[field], reverse=d < 0) + missing
        return rows[: self._limit] if self._limit else rows

    def __iter__(self):
        return iter(self._rows())


class Merged:
    def __init__(self, mine, shared, name: str):
        self.mine, self.shared, self.name = mine, shared, name
        self._hidden = hidden_ids(name)

    def _visible_shared(self, flt):
        flt = dict(flt or {})
        if self._hidden:
            flt = {"$and": [flt, {"_id": {"$nin": list(self._hidden)}}]}
        return flt

    def _both(self, flt, *a, **kw):
        own = list(self.mine.find(flt, *a, **kw))
        ids = {d["_id"] for d in own}
        return own + [d for d in self.shared.find(self._visible_shared(flt), *a, **kw) if d["_id"] not in ids]

    # ---------- reads
    def find(self, flt=None, *a, **kw):
        return _Cursor(lambda: self._both(flt, *a, **kw))

    def find_one(self, flt=None, *a, sort=None, **kw):
        if sort:
            return next(iter(self.find(flt, *a, **kw).sort(sort).limit(1)), None)
        return self.mine.find_one(flt, *a, **kw) or self.shared.find_one(self._visible_shared(flt), *a, **kw)

    def count_documents(self, flt=None, **kw):
        return len(self._both(flt))

    def aggregate(self, pipeline, *a, **kw):
        """Vector search runs in both databases; results merge by score."""
        own = list(self.mine.aggregate(pipeline, *a, **kw))
        ids = {d["_id"] for d in own}
        shared = [d for d in self.shared.aggregate(pipeline, *a, **kw)
                  if d["_id"] not in ids and d["_id"] not in self._hidden]
        rows = own + shared
        if rows and "_score" in rows[0]:
            rows.sort(key=lambda d: d.get("_score", 0), reverse=True)
        return iter(rows)

    # ---------- writes: inserts stay private; changes fall through to the shared memory
    def update_one(self, flt, update, *a, **kw):
        res = self.mine.update_one(flt, update, *a, **kw)
        if res.matched_count or kw.get("upsert"):
            return res
        return self.shared.update_one(self._visible_shared(flt), update, *a, **kw)

    def update_many(self, flt, update, *a, **kw):
        res = self.mine.update_many(flt, update, *a, **kw)
        self.shared.update_many(self._visible_shared(flt), update, *a, **kw)
        return res

    def delete_one(self, flt, *a, **kw):
        res = self.mine.delete_one(flt, *a, **kw)
        return res if res.deleted_count else self.shared.delete_one(self._visible_shared(flt), *a, **kw)

    def delete_many(self, flt, *a, **kw):
        res = self.mine.delete_many(flt, *a, **kw)
        self.shared.delete_many(self._visible_shared(flt), *a, **kw)
        return res

    def __getattr__(self, attr):
        # insert_one, insert_many, replace_one, indexes, search indexes: the user's own database
        return getattr(self.mine, attr)
