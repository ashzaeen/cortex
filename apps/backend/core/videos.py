"""Short captured videos, served at GET /videos/{name}.

The iOS recorder writes an ISO Base Media File (QuickTime/MOV). Duration is read
from its movie header so the backend independently enforces the 10-second cap.

Durable copy: MongoDB, split into 4 MB chunks (`video_chunks`) under a manifest (`videos`), because a
video can exceed MongoDB's 16 MB document limit and a container's local disk is wiped on every Railway
deploy. VIDEO_STORE on disk is only a cache; the route rebuilds the file there from the database when a
fresh container does not have it, then serves it with byte ranges for Safari playback.
"""
import logging
import re
import struct

from core import db
from core.config import settings
from core.errors import ApiError
from core.ids import new_id
from core.timeutil import now

log = logging.getLogger(__name__)
CHUNK = 4 * 1024 * 1024
_NAME = re.compile(r"^[A-Za-z0-9_-]+\.mov$")

MAX_DURATION_SECONDS = 10.0
MAX_BYTES = 20 * 1024 * 1024


def duration_seconds(data: bytes) -> float:
    """Read the mvhd duration from a MOV/MP4 file."""
    offset = 0
    while True:
        marker = data.find(b"mvhd", offset)
        if marker < 0:
            raise ApiError(400, "bad_video", "Video has no readable movie duration.")
        payload = marker + 4
        if payload + 24 > len(data):
            raise ApiError(400, "bad_video", "Video movie header is truncated.")
        version = data[payload]
        try:
            if version == 0:
                timescale, duration = struct.unpack_from(">II", data, payload + 12)
            elif version == 1:
                timescale = struct.unpack_from(">I", data, payload + 20)[0]
                duration = struct.unpack_from(">Q", data, payload + 24)[0]
            else:
                offset = payload
                continue
        except struct.error as exc:
            raise ApiError(400, "bad_video", "Video movie header is truncated.") from exc
        if not timescale:
            raise ApiError(400, "bad_video", "Video movie timescale is invalid.")
        return duration / timescale


def validate(data: bytes) -> float:
    if len(data) > MAX_BYTES:
        raise ApiError(400, "video_too_large", "Video exceeds the 20 MB upload limit.")
    if len(data) < 12 or data[4:8] != b"ftyp":
        raise ApiError(400, "bad_video", "Video must be a QuickTime or MP4 file.")
    duration = duration_seconds(data)
    if duration > MAX_DURATION_SECONDS:
        raise ApiError(400, "video_too_long", "Video exceeds the 10-second capture limit.")
    return duration


def _cache_write(name: str, data: bytes):
    try:
        settings.video_store.mkdir(parents=True, exist_ok=True)
        (settings.video_store / name).write_bytes(data)
    except OSError as e:  # the cache is optional; the database copy is the record
        log.warning("video cache write failed for %s: %s", name, e)


def save(data: bytes) -> str:
    """Store the video durably (chunked in MongoDB), cache it on disk, return its public URL."""
    name = f"{new_id('video')}.mov"
    chunks = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)] or [b""]
    for n, part in enumerate(chunks):
        db.col("video_chunks").insert_one({"_id": f"{name}#{n}", "video": name, "n": n, "data": part})
    # The manifest goes last, so a half-written video is never served.
    db.col("videos").insert_one({"_id": name, "size": len(data), "chunks": len(chunks),
                                 "content_type": "video/quicktime", "created_at": now()})
    _cache_write(name, data)
    return f"{settings.public_url}/videos/{name}"


def cached_path(name: str):
    """Path to the video on this container's disk, rebuilt from the database if missing; None if unknown."""
    if not _NAME.match(name):
        return None
    path = settings.video_store / name
    if path.is_file():
        return path
    meta = db.col("videos").find_one({"_id": name})
    if not meta:
        return None
    parts = sorted(db.col("video_chunks").find({"video": name}), key=lambda d: d["n"])
    if len(parts) != meta["chunks"]:
        log.error("video %s has %d of %d chunks", name, len(parts), meta["chunks"])
        return None
    _cache_write(name, b"".join(bytes(p["data"]) for p in parts))
    return path if path.is_file() else None


def delete_url(url: str | None) -> bool:
    """Delete a video (database copy and cache) by its URL."""
    if not url or "/videos/" not in url:
        return False
    name = url.rsplit("/videos/", 1)[1]
    if not _NAME.match(name):
        return False
    removed = db.col("videos").delete_one({"_id": name}).deleted_count > 0
    db.col("video_chunks").delete_many({"video": name})
    path = settings.video_store / name
    if path.is_file():
        path.unlink()
        removed = True
    return removed
