"""Email delivery for the follow-up action. EMAIL_DRY_RUN=true (default) never sends.
Providers: smtp (EMAIL_FROM + EMAIL_API_KEY as the SMTP password, e.g. a Gmail app password) or resend."""
import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from core.config import settings

log = logging.getLogger(__name__)


class EmailError(Exception):
    pass


def _reason(exc: urllib.error.HTTPError) -> str:
    """The provider's own explanation (Resend answers JSON with a message), so the receipt says why."""
    try:
        body = exc.read().decode(errors="replace")
        return (json.loads(body).get("message") or body)[:240]
    except Exception:  # noqa: BLE001 - never let error reporting fail the error
        return exc.reason or "no detail"


def can_send() -> bool:
    return not settings.email_dry_run and settings.email_provider in {"smtp", "resend"} and bool(
        settings.email_from and settings.email_api_key)


def send(to: str, subject: str, body: str):
    if not can_send():
        raise EmailError("email sending is not configured (EMAIL_DRY_RUN, EMAIL_PROVIDER, EMAIL_FROM, EMAIL_API_KEY)")
    if settings.email_provider == "smtp":
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = settings.email_from, to, subject
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            s.login(settings.email_from, settings.email_api_key)
            s.send_message(msg)
    else:
        req = urllib.request.Request(
            "https://api.resend.com/emails", method="POST",
            data=json.dumps({"from": settings.email_from, "to": [to], "subject": subject, "text": body}).encode(),
            headers={"Authorization": f"Bearer {settings.email_api_key}", "Content-Type": "application/json",
                     "User-Agent": "cortex-backend/1.0"})  # Resend (Cloudflare) answers 403 1010 to urllib's default
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
                if resp.status >= 300:
                    raise EmailError(f"resend returned {resp.status}")
        except urllib.error.HTTPError as exc:
            raise EmailError(f"Resend said {exc.code}: {_reason(exc)}") from exc
    log.info("follow-up email sent to %s", to)
