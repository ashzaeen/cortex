"""Time helpers. Stored in UTC; returned as ISO 8601 with the user's offset (like the fixtures)."""
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from core.config import settings


def tz() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def now() -> datetime:
    return datetime.now(UTC)


def parse_dt(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz())
    return dt.astimezone(UTC)


def iso(dt: datetime | None) -> str | None:
    """2026-11-15T14:02:11-06:00"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(tz()).isoformat(timespec="seconds")


def human(dt: datetime | None) -> str:
    """'today at 2:02 PM', 'Wed Nov 11 at 10:15 AM'"""
    if dt is None:
        return ""
    local = dt.astimezone(tz())
    today = now().astimezone(tz()).date()
    clock = local.strftime("%I:%M %p").lstrip("0")
    if local.date() == today:
        return f"today at {clock}"
    if local.date() == today - timedelta(days=1):
        return f"yesterday at {clock}"
    return f"{local.strftime('%a %b')} {local.day} at {clock}"


def human_date(d: str | None) -> str:
    """'2026-11-20' -> 'Friday, Nov 20'"""
    if not d:
        return ""
    try:
        dd = date.fromisoformat(d)
    except ValueError:
        return d
    return f"{dd.strftime('%A, %b')} {dd.day}"
