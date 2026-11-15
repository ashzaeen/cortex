"""Snapshots live in SNAPSHOT_STORE (default apps/backend/data/snapshots, gitignored) and are served at
GET /snapshots/{name}. snapshot_url is absolute (PUBLIC_URL/snapshots/<name>). Fixture snapshots keep
their repo-relative path and are served at GET /fixtures/snapshots/{name}."""
from core.config import settings
from core.ids import new_id


def _kind(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return "jpg"


def save(data: bytes) -> str:
    """Store bytes, return the public snapshot_url."""
    settings.snapshot_store.mkdir(parents=True, exist_ok=True)
    name = f"{new_id('snap')}.{_kind(data)}"
    (settings.snapshot_store / name).write_bytes(data)
    return f"{settings.public_url}/snapshots/{name}"


def delete_url(url: str | None) -> bool:
    """Delete a stored snapshot by its URL. Fixture snapshots are never deleted."""
    if not url or "/snapshots/" not in url or url.startswith("fixtures/"):
        return False
    name = url.rsplit("/snapshots/", 1)[1]
    path = settings.snapshot_store / name
    if path.parent == settings.snapshot_store and path.exists():
        path.unlink()
        return True
    return False


def load_bytes(url: str | None) -> bytes | None:
    if not url or "/snapshots/" not in url or url.startswith("fixtures/"):
        return None
    path = settings.snapshot_store / url.rsplit("/snapshots/", 1)[1]
    return path.read_bytes() if path.exists() else None
