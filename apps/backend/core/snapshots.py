"""Snapshot images, served at GET /snapshots/{name}; snapshot_url is absolute (PUBLIC_URL/snapshots/<name>).

Durable copy: the `snapshots` collection in the configured MongoDB (Atlas in production), so images
survive redeploys, restarts and new replicas; a container's local disk is wiped on every Railway deploy.
SNAPSHOT_STORE on disk is only a read cache. Fixture snapshots keep their repo-relative path and are
served at GET /fixtures/snapshots/{name}; they are never stored or deleted here."""
import logging
import re

from core import db
from core.config import settings
from core.ids import new_id
from core.timeutil import now

log = logging.getLogger(__name__)
_NAME = re.compile(r"^[A-Za-z0-9_-]+\.(jpg|png|webp)$")
_MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def _kind(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return "jpg"


def _name_from(url: str | None) -> str | None:
    if not url or "/snapshots/" not in url or url.startswith("fixtures/"):
        return None
    name = url.rsplit("/snapshots/", 1)[1]
    return name if _NAME.match(name) else None


def _cache_write(name: str, data: bytes):
    try:
        settings.snapshot_store.mkdir(parents=True, exist_ok=True)
        (settings.snapshot_store / name).write_bytes(data)
    except OSError as e:  # the cache is optional; the database copy is the record
        log.warning("snapshot cache write failed for %s: %s", name, e)


def save(data: bytes) -> str:
    """Store bytes durably, return the public snapshot_url."""
    kind = _kind(data)
    name = f"{new_id('snap')}.{kind}"
    db.col("snapshots").insert_one({
        "_id": name, "data": data, "content_type": _MIME[kind], "size": len(data),
        "created_at": now(),
    })
    _cache_write(name, data)
    return f"{settings.public_url}/snapshots/{name}"


def read(name: str) -> tuple[bytes, str] | None:
    """Bytes and content type for a stored snapshot: disk cache first, then the database."""
    if not _NAME.match(name):
        return None
    path = settings.snapshot_store / name
    if path.is_file():
        return path.read_bytes(), _MIME[name.rsplit(".", 1)[1]]
    doc = db.col("snapshots").find_one({"_id": name})
    if not doc:
        return None
    data = bytes(doc["data"])
    _cache_write(name, data)  # warm the cache for the next request on this container
    return data, doc.get("content_type") or _MIME[name.rsplit(".", 1)[1]]


def delete_url(url: str | None) -> bool:
    """Delete a stored snapshot (database copy and cache) by its URL. Fixture snapshots are never deleted."""
    name = _name_from(url)
    if not name:
        return False
    removed = db.col("snapshots").delete_one({"_id": name}).deleted_count > 0
    path = settings.snapshot_store / name
    if path.is_file():
        path.unlink()
        removed = True
    return removed


def load_bytes(url: str | None) -> bytes | None:
    name = _name_from(url)
    found = read(name) if name else None
    return found[0] if found else None
