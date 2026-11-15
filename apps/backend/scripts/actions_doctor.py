"""Are the real integrations behind the actions ready, and do they really work? (ACT-2, ACT-5..7, ACT-9, issue #52)

  python -m scripts.actions_doctor                        readiness only: names what is set, sends nothing
  python -m scripts.actions_doctor --google               real Calendar, Tasks and Drive round trip, then removes it
  python -m scripts.actions_doctor --email-to a@b.com     ONE real email to that address
  python -m scripts.actions_doctor --text +15555550123    ONE real text to that (Chert-verified) phone

Real steps only run when asked for. They need the same settings the backend uses (repo .env or apps/backend/.env):
EMAIL_DRY_RUN=false with EMAIL_PROVIDER, EMAIL_FROM and EMAIL_API_KEY; GOOGLE_REFRESH_TOKEN with AUTH_GOOGLE_ID and
AUTH_GOOGLE_SECRET (get the token with `python -m scripts.google_token`); MESSAGE_DRY_RUN=false with the CHERT_* keys.
It prints which variables are missing, never their values. The Google step undoes itself: the event and task are
deleted and the doc goes to Drive's trash. Exit code 1 if any step you asked for fails."""
import argparse
import sys
from datetime import datetime, timedelta

from actions import chert, email, google
from core.config import settings
from core.timeutil import now


def _missing(named: dict) -> list[str]:
    return [k for k, v in named.items() if not v]


def readiness() -> list[tuple[str, str, str]]:
    """(area, state, detail) with state ready | dry_run | missing. Pure: reads settings only."""
    out = []
    gap = _missing({"EMAIL_PROVIDER": settings.email_provider in {"smtp", "resend"} and settings.email_provider,
                    "EMAIL_FROM": settings.email_from, "EMAIL_API_KEY": settings.email_api_key})
    if gap:
        out.append(("email", "missing", "needs " + ", ".join(gap) + " (EMAIL_PROVIDER is smtp or resend)"))
    elif settings.email_dry_run:
        out.append(("email", "dry_run", f"{settings.email_provider} is set, but EMAIL_DRY_RUN=true saves drafts only"))
    else:
        out.append(("email", "ready", f"sends through {settings.email_provider}"))
    gap = _missing({"AUTH_GOOGLE_ID": settings.google_client_id, "AUTH_GOOGLE_SECRET": settings.google_client_secret,
                    "GOOGLE_REFRESH_TOKEN": settings.google_refresh_token})
    if gap:
        out.append(("google", "missing", "needs " + ", ".join(gap) + " (voice and call approvals need the refresh token; "
                    "dashboard taps use the signed-in token). Run: python -m scripts.google_token"))
    else:
        out.append(("google", "ready", "can write to Calendar, Tasks and Drive without the dashboard"))
    gap = _missing({"CHERT_API_KEY": settings.chert_api_key, "CHERT_PROJECT_ID": settings.chert_project_id,
                    "CHERT_LINE_ID": settings.chert_line_id})
    if gap:
        out.append(("text", "missing", "needs " + ", ".join(gap)))
    elif settings.message_dry_run:
        out.append(("text", "dry_run", "Chert is set, but MESSAGE_DRY_RUN=true saves drafts only"))
    else:
        out.append(("text", "ready", "sends through the Chert line to verified phones"))
    return out


def live_email(to: str) -> tuple[bool, str]:
    if not email.can_send():
        return False, "not sent: set EMAIL_DRY_RUN=false and EMAIL_PROVIDER, EMAIL_FROM, EMAIL_API_KEY first"
    try:
        email.send(to, "Cortex action check", "This is a one-time check that Cortex can send an approved follow-up "
                   f"email. Sent {now():%Y-%m-%d %H:%M}. You can ignore it.")
    except Exception as exc:  # noqa: BLE001
        return False, f"send failed: {exc}"
    return True, f"sent through {settings.email_provider} to {to}; check that inbox (and spam)"


def live_text(to: str) -> tuple[bool, str]:
    if not chert.can_send():
        return False, "not sent: set MESSAGE_DRY_RUN=false and the CHERT_* keys first"
    try:
        chert.send(to, "Cortex action check. You can ignore this text.", f"doctor-{now():%Y%m%d%H%M%S}")
    except Exception as exc:  # noqa: BLE001
        return False, f"send failed: {exc}"
    return True, f"texted {to} through the Chert line"


def live_google() -> list[tuple[bool, str]]:
    """Create one event, task and doc, then undo each, exactly as an approved action and its undo would."""
    steps: list[tuple[bool, str]] = []
    try:
        token = google.resolve_token(None)
    except google.GoogleError as exc:
        return [(False, f"could not get a Google token: {exc}")]
    if not token:
        return [(False, "no token: set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and GOOGLE_REFRESH_TOKEN")]
    steps.append((True, "got an access token from the refresh token"))
    start = (datetime.now().astimezone() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
    event = {"title": "Cortex check (safe to delete)", "start": start.isoformat(),
             "end": (start + timedelta(minutes=15)).isoformat()}
    plan = [
        ("calendar event", lambda: google.create_event(token, event),
         lambda ext: google.delete_event(token, ext["id"]), "deleted"),
        ("task", lambda: google.create_task(token, {"title": "Cortex check (safe to delete)", "notes": None, "due": None}),
         lambda ext: google.delete_task(token, ext["id"]), "deleted"),
        ("doc", lambda: google.create_doc(token, "Cortex check (safe to delete)", "Created by the action doctor."),
         lambda ext: google.trash_file(token, ext["id"]), "moved to Drive's trash"),
    ]
    for name, make, undo, verb in plan:
        try:
            ext = make()
        except google.GoogleError as exc:
            steps.append((False, f"{name}: create failed: {exc}"))
            continue
        try:
            undo(ext)
            steps.append((True, f"{name}: created, then {verb}"))
        except google.GoogleError as exc:
            steps.append((False, f"{name}: created ({ext.get('url') or ext['id']}) but undo failed: {exc}. Remove it by hand"))
    return steps


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--email-to", metavar="ADDRESS")
    ap.add_argument("--text", metavar="PHONE")
    ap.add_argument("--google", action="store_true")
    args = ap.parse_args(argv)
    failed = False
    print("Readiness (nothing is sent by this part):")
    for area, state, detail in readiness():
        print(f"  {area:<7}{state:<9}{detail}")
    runs = []
    if args.google:
        runs += [("google", live_google())]
    if args.email_to:
        runs += [("email", [live_email(args.email_to)])]
    if args.text:
        runs += [("text", [live_text(args.text)])]
    for area, steps in runs:
        print(f"\nLive {area}:")
        for ok, msg in steps:
            print(f"  {'PASS' if ok else 'FAIL'}  {msg}")
            failed = failed or not ok
    if not runs:
        print("\nAdd --google, --email-to ADDRESS or --text PHONE to try the real thing.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
