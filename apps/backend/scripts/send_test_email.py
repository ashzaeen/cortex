"""Send one test email through the same code the backend uses (actions/email.py), to prove the credentials work
before they go into Railway. Run from apps/backend with EMAIL_FROM and EMAIL_API_KEY set (shell or .env):

  python -m scripts.send_test_email [recipient]

The recipient defaults to FOLLOWUP_EMAIL_TO (the hardcoded demo address). Nothing is stored; the key is never printed."""
import smtplib
import sys

from actions import email
from core.config import settings


def main() -> int:
    settings.email_dry_run = False  # this script exists to send for real
    to = sys.argv[1] if len(sys.argv) > 1 else settings.followup_email_to
    if not to:
        print("No recipient: pass one as an argument or set FOLLOWUP_EMAIL_TO.")
        return 2
    if not email.can_send():
        print("Not configured: set EMAIL_FROM and EMAIL_API_KEY (and EMAIL_PROVIDER if not smtp).")
        return 2
    try:
        email.send(to, "Cortex test email", "If you can read this, Cortex can send follow-up emails.")
    except smtplib.SMTPAuthenticationError:
        print("Gmail rejected the login. Use an app password (2-Step Verification on), 16 letters, no spaces.")
        return 1
    except Exception as exc:  # noqa: BLE001 - show whatever the provider said
        print(f"Could not send: {type(exc).__name__}: {exc}")
        return 1
    print(f"Sent a test email to {to} from {settings.email_from} using {settings.email_provider}. Check the inbox (and spam).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
