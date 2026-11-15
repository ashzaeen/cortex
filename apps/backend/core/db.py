"""MongoDB Atlas: the memory store ("what happened"). Document _id is the contract id.

Collections: moments (+ embedding), people, promises, actions, receipts, modes, state (privacy).
Each user's memory is its own database (core/user.py): col() always resolves in the current user's.
"""
import logging

import certifi
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError

from core.config import settings

log = logging.getLogger(__name__)
_client = None
_db = None
_mock = False


def init():
    global _client, _db, _mock
    if settings.use_mongomock or not settings.database_url:
        import mongomock

        if not settings.use_mongomock:
            log.warning("DATABASE_URL is empty: using in-memory MongoDB (data is lost on restart).")
        _client, _mock = mongomock.MongoClient(tz_aware=True), True
    else:
        _client, _mock = MongoClient(
            settings.database_url,
            tz_aware=True,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=8000,
        ), False
    _db = _client[settings.mongodb_db]
    ensure_indexes()


def col(name: str):
    """A collection in the current user's database (MONGODB_DB for the default user). For a signed-in user,
    memory collections also show the shared default memory (core/merged.py)."""
    if _db is None:
        init()
    from core import merged, user

    mine = _client[user.db_name()][name]
    # Public /demo visitors (v-<id>@demo.cortex) see only their own demo profile, never the owner's real captures.
    if user.current() == user.DEFAULT or name not in merged.MERGED or user.current().endswith("@demo.cortex"):
        return mine
    return merged.Merged(mine, _db[name], name)


def own(name: str):
    """Only the current user's own database, never the shared memory (seeding, resets)."""
    if _db is None:
        init()
    from core import user

    return _client[user.db_name()][name]


def shared(name: str):
    """A collection shared by every user (caches only, never memory)."""
    if _db is None:
        init()
    return _db[name]


def is_mock() -> bool:
    return _mock


def ping() -> bool:
    try:
        _client.admin.command("ping")
        return True
    except Exception:  # noqa: BLE001
        return _mock


def reset():
    """Delete the current user's memory."""
    for name in ("moments", "people", "promises", "actions", "receipts", "modes", "state", "drafts", "list_items"):
        own(name).delete_many({})
    from core import user

    user.forget_ready()


def ensure_indexes():
    try:
        col("moments").create_index([("ts", DESCENDING)])
        col("moments").create_index([("person_ids", ASCENDING)])
        col("people").create_index([("name_lower", ASCENDING)])
        col("promises").create_index([("person_id", ASCENDING), ("status", ASCENDING)])
        col("receipts").create_index([("created_at", DESCENDING)])
    except PyMongoError as exc:
        log.warning("Index creation skipped: %s", exc)
    if not _mock:
        ensure_vector_index()


def ensure_vector_index():
    from pymongo.operations import SearchIndexModel

    try:
        if settings.vector_index in {ix.get("name") for ix in col("moments").list_search_indexes()}:
            return
        col("moments").create_search_index(SearchIndexModel(
            name=settings.vector_index, type="vectorSearch",
            definition={"fields": [
                {"type": "vector", "path": "embedding", "numDimensions": settings.embed_dim, "similarity": "cosine"},
                {"type": "filter", "path": "ts"},
                {"type": "filter", "path": "mode"},
            ]},
        ))
        log.info("Requested Atlas vector index %s (ready in about a minute).", settings.vector_index)
    except Exception as exc:  # noqa: BLE001
        log.warning("Vector index not created (%s); search falls back to local cosine.", exc)
