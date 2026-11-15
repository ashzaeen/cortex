"""Tiger Data (TimescaleDB) schema: the time-series spine ("when it happened").

  timeline         one row per moment -> time-range recall, rewind scrubber, forget-by-range
  context_stream   place / calendar / mode over time -> mode auto-suggest, "where was I when"
  action_log       append-only audit of every action state change -> receipts and undo
  capture_metrics  latency / size per processed moment -> live health panel
  hourly_activity  continuous aggregate over timeline -> daily digest and heat strip
"""

STATEMENTS = [
    "CREATE EXTENSION IF NOT EXISTS timescaledb",
    """
    CREATE TABLE IF NOT EXISTS timeline (
        time             TIMESTAMPTZ NOT NULL,
        user_id          TEXT        NOT NULL,
        moment_id        TEXT        NOT NULL,
        mode             TEXT,
        source           TEXT,
        place_label      TEXT,
        has_snapshot     BOOLEAN     DEFAULT FALSE,
        person_count     INT         DEFAULT 0,
        commitment_count INT         DEFAULT 0,
        action_count     INT         DEFAULT 0
    )
    """,
    "SELECT create_hypertable('timeline', 'time', if_not_exists => TRUE)",
    "CREATE INDEX IF NOT EXISTS timeline_user_time ON timeline (user_id, time DESC)",
    "CREATE INDEX IF NOT EXISTS timeline_moment ON timeline (moment_id)",
    """
    CREATE TABLE IF NOT EXISTS context_stream (
        time              TIMESTAMPTZ NOT NULL,
        user_id           TEXT        NOT NULL,
        lat               DOUBLE PRECISION,
        lng               DOUBLE PRECISION,
        place_label       TEXT,
        calendar_event_id TEXT,
        mode              TEXT
    )
    """,
    "SELECT create_hypertable('context_stream', 'time', if_not_exists => TRUE)",
    "CREATE INDEX IF NOT EXISTS context_user_time ON context_stream (user_id, time DESC)",
    """
    CREATE TABLE IF NOT EXISTS action_log (
        time      TIMESTAMPTZ NOT NULL,
        user_id   TEXT        NOT NULL,
        action_id TEXT,
        event     TEXT        NOT NULL,
        actor     TEXT,
        detail    JSONB
    )
    """,
    "SELECT create_hypertable('action_log', 'time', if_not_exists => TRUE)",
    "CREATE INDEX IF NOT EXISTS action_log_user_time ON action_log (user_id, time DESC)",
    """
    CREATE TABLE IF NOT EXISTS capture_metrics (
        time       TIMESTAMPTZ NOT NULL,
        user_id    TEXT        NOT NULL,
        kind       TEXT        NOT NULL,
        latency_ms INT,
        bytes      INT
    )
    """,
    "SELECT create_hypertable('capture_metrics', 'time', if_not_exists => TRUE)",
    """
    CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_activity
    WITH (timescaledb.continuous) AS
    SELECT time_bucket(INTERVAL '1 hour', time) AS bucket,
           user_id,
           count(*)              AS moments,
           sum(person_count)     AS people,
           sum(commitment_count) AS commitments,
           sum(action_count)     AS actions,
           count(*) FILTER (WHERE has_snapshot) AS snapshots
    FROM timeline
    GROUP BY bucket, user_id
    WITH NO DATA
    """,
    # Real-time aggregation: include rows not yet materialized, so today's digest is current
    "ALTER MATERIALIZED VIEW hourly_activity SET (timescaledb.materialized_only = false)",
    """
    SELECT add_continuous_aggregate_policy('hourly_activity',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '5 minutes',
        if_not_exists => TRUE)
    """,
]
