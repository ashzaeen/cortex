"""Short captured videos stored outside MongoDB and served by URL.

The iOS recorder writes an ISO Base Media File (QuickTime/MOV). Duration is read
from its movie header so the backend independently enforces the 10-second cap.
"""
import struct

from core.config import settings
from core.errors import ApiError
from core.ids import new_id

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


def save(data: bytes) -> str:
    settings.video_store.mkdir(parents=True, exist_ok=True)
    name = f"{new_id('video')}.mov"
    (settings.video_store / name).write_bytes(data)
    return f"{settings.public_url}/videos/{name}"


def delete_url(url: str | None) -> bool:
    if not url or "/videos/" not in url:
        return False
    name = url.rsplit("/videos/", 1)[1]
    path = settings.video_store / name
    if path.parent == settings.video_store and path.exists():
        path.unlink()
        return True
    return False
