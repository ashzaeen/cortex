"""Tiger Data (Postgres + TimescaleDB) access. If disabled or unreachable, every helper is a no-op
and callers fall back to MongoDB, so the demo never dies on the time-series layer."""
import json
import logging
from datetime import datetime

from psycopg.rows import dict_row

from core.config import settings
from core.tiger_schema import STATEMENTS

log = logging.getLogger(__name__)

_pool = None
USER = "demo"  # single-user hackathon build; column kept for later


def init():
    global _pool
    if not settings.tiger_url:
        log.warning("TIGER_DATABASE_URL empty: Tiger Data disabled; time queries fall back to MongoDB.")
        return
    try:
        from psycopg_pool import ConnectionPool

        _pool = ConnectionPool(
            settings.tiger_url,
            min_size=1,
            max_size=6,
            kwargs={"autocommit": True, "row_factory": dict_row},
            open=True,
            timeout=10,
        )
        migrate()
    except Exception as exc:  # noqa: BLE001
        log.error("Tiger Data unavailable (%s); continuing without it.", exc)
        _pool = None


def enabled() -> bool:
    return _pool is not None


def migrate():
    for stmt in STATEMENTS:
        try:
            execute(stmt)
        except Exception as exc:  # noqa: BLE001
            log.warning("Tiger migration step skipped: %s | %s", stmt.strip().splitlines()[0][:70], exc)


def execute(sql: str, params=None):
    if not _pool:
        return None
    with _pool.connection() as conn:
        conn.execute(sql, params)


def fetchall(sql: str, params=None) -> list[dict]:
    if not _pool:
        return []
    with _pool.connection() as conn:
        return list(conn.execute(sql, params).fetchall())


def _safe(fn):
    def wrapper(*args, **kwargs):
        if not _pool:
            return None
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            log.warning("Tiger write failed in %s: %s", fn.__name__, exc)
            return None

    return wrapper


# ---------- writes ----------

@_safe
def log_timeline(moment: dict):
    execute(
        """INSERT INTO timeline (time, user_id, moment_id, mode, source, place_label,
                                 has_snapshot, person_count, commitment_count, action_count)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            moment["ts"], USER, moment["_id"], moment.get("mode"), moment.get("source"),
            moment.get("place"), bool(moment.get("snapshot_url")),
            len(moment.get("person_ids", [])), int(moment.get("promise_count", 0)), 0,
        ),
    )


@_safe
def log_context(user_id: str, ts: datetime, lat=None, lng=None, place_label=None, calendar_event_id=None, mode=None):
    execute(
        """INSERT INTO context_stream (time, user_id, lat, lng, place_label, calendar_event_id, mode)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (ts, user_id, lat, lng, place_label, calendar_event_id, mode),
    )


@_safe
def log_action(user_id: str, ts: datetime, action_id: str | None, event: str, actor: str = "cortex", detail=None):
    execute(
        "INSERT INTO action_log (time, user_id, action_id, event, actor, detail) VALUES (%s, %s, %s, %s, %s, %s)",
        (ts, user_id, action_id, event, actor, json.dumps(detail or {}, default=str)),
    )


@_safe
def log_metric(user_id: str, ts: datetime, kind: str, latency_ms: int | None = None, nbytes: int | None = None):
    execute(
        "INSERT INTO capture_metrics (time, user_id, kind, latency_ms, bytes) VALUES (%s, %s, %s, %s, %s)",
        (ts, user_id, kind, latency_ms, nbytes),
    )


@_safe
def delete_timeline(moment_ids: list[str]):
    if moment_ids:
        execute("DELETE FROM timeline WHERE moment_id = ANY(%s)", (moment_ids,))


# ---------- reads ----------

def timeline_ids(user_id: str, start: datetime, end: datetime, limit: int = 500) -> list[str] | None:
    """Moment ids in a time range, newest first. None means 'Tiger unavailable, use Mongo'."""
    if not _pool:
        return None
    try:
        rows = fetchall(
            """SELECT moment_id FROM timeline
               WHERE user_id = %s AND time >= %s AND time < %s
               ORDER BY time DESC LIMIT %s""",
            (user_id, start, end, limit),
        )
        return [r["moment_id"] for r in rows]
    except Exception as exc:  # noqa: BLE001
        log.warning("Tiger timeline query failed: %s", exc)
        return None


def hourly_activity(user_id: str, start: datetime, end: datetime) -> list[dict] | None:
    if not _pool:
        return None
    try:
        return fetchall(
            """SELECT bucket, moments, people, commitments, actions, snapshots
               FROM hourly_activity WHERE user_id = %s AND bucket >= %s AND bucket < %s
               ORDER BY bucket""",
            (user_id, start, end),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Tiger hourly_activity query failed: %s", exc)
        return None


def action_history(user_id: str, limit: int = 100) -> list[dict] | None:
    if not _pool:
        return None
    try:
        return fetchall(
            "SELECT time, action_id, event, actor, detail FROM action_log WHERE user_id = %s ORDER BY time DESC LIMIT %s",
            (user_id, limit),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Tiger action_log query failed: %s", exc)
        return None


def latest_context(user_id: str) -> dict | None:
    if not _pool:
        return None
    try:
        rows = fetchall(
            "SELECT * FROM context_stream WHERE user_id = %s ORDER BY time DESC LIMIT 1", (user_id,)
        )
        return rows[0] if rows else None
    except Exception:  # noqa: BLE001
        return None


def capture_health(user_id: str, minutes: int = 15) -> dict | None:
    if not _pool:
        return None
    try:
        rows = fetchall(
            """SELECT kind, count(*) AS n, avg(latency_ms)::int AS avg_latency_ms,
                      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_latency_ms
               FROM capture_metrics
               WHERE user_id = %s AND time > now() - make_interval(mins => %s)
               GROUP BY kind""",
            (user_id, minutes),
        )
        return {r["kind"]: r for r in rows}
    except Exception:  # noqa: BLE001
        return None
