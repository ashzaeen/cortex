"""Text messages from the Chert line (ACT-9), via Chert's shared-line API.

POST {CHERT_API_URL}/shared-messages with Bearer CHERT_API_KEY, X-Chert-Project-Id and an
Idempotency-Key. Only phones verified for the Chert project can receive a text (a code sent by
iMessage from that phone). MESSAGE_DRY_RUN=true (default) never sends. Chert documents no unsend,
so undo works by holding the text until the undo window closes (see actions/doers.py)."""
import json
import logging
import urllib.error
import urllib.request

from core.config import settings

log = logging.getLogger(__name__)


class ChertError(Exception):
    pass


def can_send() -> bool:
    return not settings.message_dry_run and bool(
        settings.chert_api_key and settings.chert_project_id and settings.chert_line_id)


def send(to: str, text: str, idempotency_key: str) -> str:
    if not can_send():
        raise ChertError("texting is not configured (MESSAGE_DRY_RUN, CHERT_API_KEY, CHERT_PROJECT_ID, CHERT_LINE_ID)")
    req = urllib.request.Request(
        f"{settings.chert_api_url}/shared-messages", method="POST",
        data=json.dumps({"line_id": settings.chert_line_id, "recipient": to, "text": text}).encode(),
        headers={"Authorization": f"Bearer {settings.chert_api_key}", "X-Chert-Project-Id": settings.chert_project_id,
                 "Idempotency-Key": idempotency_key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed Chert host)
            out = json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raise ChertError(f"Chert returned {exc.code}: {exc.read().decode(errors='replace')[:300]}") from exc
    except urllib.error.URLError as exc:
        raise ChertError(f"Could not reach Chert: {exc.reason}") from exc
    log.info("text sent through Chert to %s", to)
    return str(out.get("id") or out.get("message_id") or idempotency_key)
