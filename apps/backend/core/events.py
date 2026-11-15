"""GET /events (Server-Sent Events). Sync route handlers publish; each SSE client has an asyncio queue.

Event types (contract): moment.created, moment.deleted, person.created, promise.proposed, promise.confirmed,
action.proposed, action.updated, receipt.created, privacy.changed, call.started, call.ended.
Message: event: <type>\\ndata: {"type", "at", "data": <entity>}"""
import asyncio
import json
import threading

from core.timeutil import iso, now

TYPES = {"moment.created", "moment.deleted", "person.created", "promise.proposed", "promise.confirmed",
         "action.proposed", "action.updated", "receipt.created", "privacy.changed", "mode.changed",
         "call.started", "call.ended"}

# (loop, queue, user): each SSE client only hears its own user's events.
_subs: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue, str]] = []
_lock = threading.Lock()
history: list[dict] = []  # last few events, for tests and debugging


def subscribe():
    from core import user

    sub = (asyncio.get_running_loop(), asyncio.Queue(maxsize=500), user.current())
    with _lock:
        _subs.append(sub)
    return sub


def unsubscribe(sub):
    with _lock:
        if sub in _subs:
            _subs.remove(sub)


def publish(type_: str, data: dict):
    if type_ not in TYPES:
        raise ValueError(f"unknown event type {type_}")
    from core import user

    msg = {"type": type_, "at": iso(now()), "data": data}
    history.append(msg)
    del history[:-200]
    me = user.current()
    with _lock:
        # The shared default memory is seen by everyone, so its events reach every client.
        subs = [(loop, q) for loop, q, who in _subs if who == me or me == user.DEFAULT]
    for loop, q in subs:
        try:
            loop.call_soon_threadsafe(q.put_nowait, msg)
        except (RuntimeError, asyncio.QueueFull):
            pass


def format_sse(msg: dict) -> str:
    return f"event: {msg['type']}\ndata: {json.dumps(msg, separators=(',', ':'))}\n\n"
