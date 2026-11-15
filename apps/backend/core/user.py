"""Who the current request is for. Each signed-in user has a private memory: their own MongoDB database,
seeded once from the demo profile (apps/dashboard/demo), so they start with the full demo week and
everything they add stays theirs.

The dashboard proxy sends X-Cortex-User (the signed-in email). The backend trusts it only because every
caller already needs CORTEX_API_KEY. No header = the default user, whose memory is MONGODB_DB itself
(the fixtures seed the tests and real-stack checks use)."""
import contextvars
import hashlib
import re
import threading

from core.config import settings

DEFAULT = "demo"
_current: contextvars.ContextVar[str] = contextvars.ContextVar("cortex_user", default=DEFAULT)


def current() -> str:
    return _current.get()


def set_current(user: str | None):
    return _current.set(normalize(user))


def normalize(user: str | None) -> str:
    u = (user or "").strip().lower()
    return u if u and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", u) else DEFAULT


def db_name(user: str | None = None) -> str:
    u = user or current()
    if u == DEFAULT:
        return settings.mongodb_db
    return f"{settings.mongodb_db}_u_{hashlib.sha256(u.encode()).hexdigest()[:16]}"


def carry(fn):
    """Wrap fn so it runs with this request's user, e.g. on a timer or background thread."""
    ctx = contextvars.copy_context()
    return lambda *a, **kw: ctx.run(fn, *a, **kw)


# ---------- first visit: give the user their own copy of the demo profile
_ready: set[str] = set()
_lock = threading.Lock()


def ensure_ready(user: str):
    """Idempotent and cheap after the first call per process: creates indexes, modes and privacy state,
    and seeds the demo profile the first time this user's database is used."""
    if user in _ready:
        return
    with _lock:
        if user in _ready:
            return
        token = _current.set(user)
        try:
            from core import db
            from memory import store

            db.ensure_indexes()
            if user != DEFAULT and not db.col("state").find_one({"_id": "profile"}):
                from scripts.seed import seed_profile

                seed_profile()
            store.ensure_modes()
            store.privacy()
            _ready.add(user)
        finally:
            _current.reset(token)


def forget_ready():
    """Tests: drop the per-process cache after the store is reset."""
    _ready.clear()
