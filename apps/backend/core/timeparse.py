"""Turn time phrases in questions into a UTC range: "this morning", "an hour ago", "yesterday"..."""
import re
from datetime import UTC, datetime, timedelta

from core.timeutil import now as now_utc
from core.timeutil import tz as user_tz

_NUM = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "few": 3, "half": 0.5, "couple": 2}


def _n(token: str) -> float:
    return float(_NUM.get(token, token)) if not token.isdigit() else float(token)


def parse_range(text: str, now: datetime | None = None) -> tuple[datetime, datetime] | None:
    t = (text or "").lower()
    now = now or now_utc()
    local = now.astimezone(user_tz())
    day_start = local.replace(hour=0, minute=0, second=0, microsecond=0)

    def utc(dt):
        return dt.astimezone(UTC)

    m = re.search(r"(?:last|past)\s+(\d+|a|an|one|two|three|few|couple(?: of)?)\s+(minute|min|hour|hr)s?", t)
    if m:
        unit = 60 if m.group(2).startswith(("hour", "hr")) else 1
        mins = _n(m.group(1).replace(" of", "")) * unit
        return now - timedelta(minutes=mins), now + timedelta(minutes=1)

    m = re.search(r"(\d+|a|an|one|two|three|few|half an?)\s+(minute|min|hour|hr)s?\s+ago", t)
    if m:
        token = m.group(1).split()[0]
        unit = 60 if m.group(2).startswith(("hour", "hr")) else 1
        mins = _n(token) * unit
        center = now - timedelta(minutes=mins)
        pad = max(10, mins * 0.5)  # "an hour ago" means roughly then
        return center - timedelta(minutes=pad), center + timedelta(minutes=pad)

    if "last hour" in t:
        return now - timedelta(hours=1), now + timedelta(minutes=1)
    if "yesterday" in t:
        return utc(day_start - timedelta(days=1)), utc(day_start)
    if "this morning" in t:
        return utc(day_start.replace(hour=5)), utc(day_start.replace(hour=12))
    if "this afternoon" in t or "after lunch" in t:
        return utc(day_start.replace(hour=12)), utc(day_start.replace(hour=17))
    if "lunch" in t:
        return utc(day_start.replace(hour=11)), utc(day_start.replace(hour=14))
    if "tonight" in t or "this evening" in t:
        return utc(day_start.replace(hour=17)), utc(day_start + timedelta(days=1))
    if "today" in t:
        return utc(day_start), now + timedelta(minutes=1)
    if "this week" in t:
        return utc(day_start - timedelta(days=local.weekday())), now + timedelta(minutes=1)
    return None


def parse_minutes(text: str) -> int | None:
    """'forget the last hour' -> 60, 'last 15 minutes' -> 15."""
    t = (text or "").lower()
    m = re.search(r"last\s+(\d+|a|an|one|two|three|half an?)?\s*(minute|min|hour|hr)s?", t)
    if not m:
        return None
    token = (m.group(1) or "1").split()[0]
    unit = 60 if m.group(2).startswith(("hour", "hr")) else 1
    return int(_n(token) * unit)
