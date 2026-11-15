"""Call lifecycle (T0-10): the call agent reports a FaceTime call; the dashboard shows "On Call".

POST /calls/started and /calls/ended publish call.started and call.ended; GET /calls/current says which call
is live. One call at a time. The state is in memory (like the SSE clients and undo timers), which is fine for
a 5-minute call: after a restart GET /calls/current says no call and /calls/ended for an unknown id is a 404."""
import threading
from datetime import timedelta

from core import events
from core.errors import not_found
from core.timeutil import iso, now

MAX_CALL = timedelta(minutes=6)  # Chert caps calls at 5 minutes; a call with no end after 6 counts as ended

_lock = threading.Lock()
_calls: dict[str, dict] = {}  # call_id -> {"call_id", "started_at", "ended_at"} (datetimes)
_active: str | None = None


def _out(c: dict) -> dict:
    return {"call_id": c["call_id"], "started_at": iso(c["started_at"]), "ended_at": iso(c["ended_at"])}


def _end(c: dict, at):
    c["ended_at"] = at
    events.publish("call.ended", _out(c))


def _expire(at):
    """Caller holds the lock. End the active call if it ran past MAX_CALL (the agent crashed or never reported)."""
    global _active
    c = _calls.get(_active) if _active else None
    if c and at - c["started_at"] > MAX_CALL:
        _end(c, c["started_at"] + MAX_CALL)
        _active = None


def started(call_id: str) -> dict:
    global _active
    at = now()
    with _lock:
        _expire(at)
        if _active == call_id:
            return _out(_calls[call_id])  # idempotent: nothing changes, nothing is emitted
        if _active:
            _end(_calls[_active], at)  # one call at a time
        _calls[call_id] = {"call_id": call_id, "started_at": at, "ended_at": None}
        _active = call_id
        events.publish("call.started", _out(_calls[call_id]))
        return _out(_calls[call_id])


def ended(call_id: str) -> dict:
    global _active
    at = now()
    with _lock:
        c = _calls.get(call_id)
        if c is None:
            raise not_found("call")
        if c["ended_at"] is None:
            _end(c, at)
        if _active == call_id:
            _active = None
        return _out(c)


def current() -> dict:
    with _lock:
        _expire(now())
        return {"call": _out(_calls[_active]) if _active else None}


def reset():
    """Tests start from no calls."""
    global _active
    with _lock:
        _calls.clear()
        _active = None
