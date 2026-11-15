"""Background loop for the skills: overdue nudges (WAI-5) and the automatic pre-meeting brief (BRF-6).
Same shape as routines.start_ticker: visits every user this process has served, plus the default user.
Not started when SYNC_BACKGROUND is set (tests call nudges.tick and autobrief.tick themselves)."""
import logging
import threading
import time

log = logging.getLogger(__name__)


def _loop(interval: float):
    from core import user
    from skills import autobrief, nudges

    while True:
        for who in sorted(user.known() | {user.DEFAULT}):
            token = user._current.set(who)
            try:
                nudges.tick()
                autobrief.tick()
            except Exception:  # noqa: BLE001
                log.exception("skill ticker failed for a user")
            finally:
                user._current.reset(token)
        time.sleep(interval)


def start(interval: float = 60.0):
    threading.Thread(target=_loop, args=(interval,), daemon=True, name="cortex-skill-ticker").start()
