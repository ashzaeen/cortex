"""Run follow-up work off the request thread (e.g. drafting an email after a promise is confirmed).
Tests set SYNC_BACKGROUND so the work happens inline and can be asserted."""
import logging
import os
import threading

log = logging.getLogger(__name__)


def run(fn, *args, **kwargs):
    if os.getenv("SYNC_BACKGROUND", "").lower() in {"1", "true"}:
        return fn(*args, **kwargs)

    def target():
        try:
            fn(*args, **kwargs)
        except Exception:  # noqa: BLE001
            log.exception("background task failed")

    threading.Thread(target=target, daemon=True).start()
    return None
