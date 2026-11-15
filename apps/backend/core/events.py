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

_subs: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = []
_lock = threading.Lock()
history: list[dict] = []  # last few events, for tests and debugging


def subscribe() -> tuple[asyncio.AbstractEventLoop, asyncio.Queue]:
    sub = (asyncio.get_running_loop(), asyncio.Queue(maxsize=500))
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
    msg = {"type": type_, "at": iso(now()), "data": data}
    history.append(msg)
    del history[:-200]
    with _lock:
        subs = list(_subs)
    for loop, q in subs:
        try:
            loop.call_soon_threadsafe(q.put_nowait, msg)
        except (RuntimeError, asyncio.QueueFull):
            pass


def format_sse(msg: dict) -> str:
    return f"event: {msg['type']}\ndata: {json.dumps(msg, separators=(',', ':'))}\n\n"
