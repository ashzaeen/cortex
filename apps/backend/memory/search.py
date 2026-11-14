"""Search memory and always return the source moments (T0-2).

1. Time phrases ("this morning", "yesterday") narrow the range.
2. Atlas $vectorSearch when available.
3. Freshness: Atlas Search indexes update asynchronously, so moments from the last RECENT_MERGE_MINUTES are
   always scored locally and merged in. A promise said 30 s ago is findable right away (demo beat 3).
4. Without Atlas (mongomock, index still building, or an error) every moment is scored locally.
Scores are on a 0..1 scale (cosine mapped like Atlas: (1 + cos) / 2) plus a small keyword boost."""
import logging
from datetime import timedelta

from core import db, timeparse
from core.config import settings
from core.llm import get_llm
from core.llm_mock import words
from core.timeutil import now

log = logging.getLogger(__name__)


def _cos(a, b) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=False))


def _local_score(qvec, qwords: set, doc: dict) -> float:
    text = " ".join(filter(None, [doc.get("transcript"), doc.get("caption"), doc.get("place")]))
    overlap = len(qwords & set(words(text)))
    return (1 + _cos(qvec, doc.get("embedding") or [])) / 2 + 0.04 * overlap


def _vector(qvec, limit: int, time_range) -> list[tuple[dict, float]]:
    flt = {"ts": {"$gte": time_range[0], "$lt": time_range[1]}} if time_range else None
    stage = {"index": settings.vector_index, "path": "embedding", "queryVector": qvec,
             "numCandidates": max(100, limit * 20), "limit": limit}
    if flt:
        stage["filter"] = flt
    pipeline = [{"$vectorSearch": stage}, {"$addFields": {"_score": {"$meta": "vectorSearchScore"}}},
                {"$project": {"embedding": 0}}]
    try:
        return [(d, float(d.pop("_score"))) for d in db.col("moments").aggregate(pipeline)]
    except Exception as exc:  # noqa: BLE001
        log.warning("Atlas vector search unavailable (%s); scoring locally.", exc)
        return []


def search(q: str, limit: int = 5, person_id: str | None = None) -> list[tuple[dict, float]]:
    time_range = timeparse.parse_range(q)
    qvec = get_llm().embed(q, task="RETRIEVAL_QUERY")
    qwords = set(words(q))
    scores: dict[str, tuple[dict, float]] = {}

    vector_hits = [] if db.is_mock() or not qvec else _vector(qvec, limit * 3, time_range)
    for doc, score in vector_hits:
        text = " ".join(filter(None, [doc.get("transcript"), doc.get("caption")]))
        scores[doc["_id"]] = (doc, score + 0.04 * len(qwords & set(words(text))))

    base = {}
    if time_range:
        base["ts"] = {"$gte": time_range[0], "$lt": time_range[1]}
    if vector_hits:  # only the freshest moments need local scoring
        base["ts"] = {"$gte": now() - timedelta(minutes=settings.recent_merge_minutes)}
    for doc in db.col("moments").find(base).sort("ts", -1).limit(1000):
        s = _local_score(qvec, qwords, doc)
        doc.pop("embedding", None)
        if doc["_id"] not in scores or s > scores[doc["_id"]][1]:
            scores[doc["_id"]] = (doc, s)

    ranked = sorted(scores.values(), key=lambda t: t[1], reverse=True)
    if person_id:
        ranked = [t for t in ranked if person_id in t[0].get("person_ids", [])]
    return ranked[:limit]
