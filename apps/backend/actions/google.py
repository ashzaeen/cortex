"""Google Calendar, Tasks and Drive for the non-email actions (ACT-5, ACT-6, ACT-7).

The token is the signed-in user's OAuth access token. The dashboard proxy forwards it as
X-Google-Access-Token; without one, GOOGLE_REFRESH_TOKEN plus the sign-in client (AUTH_GOOGLE_ID,
AUTH_GOOGLE_SECRET) mints one. No token means a dry run (the caller decides). Scopes needed:
calendar.events, tasks, drive.file (drive.file only reaches files Cortex created)."""
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from core.config import settings

log = logging.getLogger(__name__)
_cached: dict = {}


class GoogleError(Exception):
    pass


def resolve_token(header_token: str | None) -> str | None:
    if header_token:
        return header_token
    if not (settings.google_refresh_token and settings.google_client_id and settings.google_client_secret):
        return None
    if _cached.get("exp", 0) > time.time() + 60:
        return _cached["token"]
    data = urllib.parse.urlencode({
        "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "refresh_token": settings.google_refresh_token, "grant_type": "refresh_token"}).encode()
    out = _request("POST", "https://oauth2.googleapis.com/token", None, data,
                   {"Content-Type": "application/x-www-form-urlencoded"})
    _cached.update(token=out["access_token"], exp=time.time() + int(out.get("expires_in", 3600)))
    return _cached["token"]


def _request(method: str, url: str, token: str | None, body: bytes | None = None, headers: dict | None = None):
    h = {**({"Authorization": f"Bearer {token}"} if token else {}), **(headers or {})}
    req = urllib.request.Request(url, method=method, data=body, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed Google hosts)
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise GoogleError(f"Google returned {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise GoogleError(f"Could not reach Google: {exc.reason}") from exc
    return json.loads(raw) if raw else {}


def _json(method: str, url: str, token: str, payload: dict | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    return _request(method, url, token, body, {"Content-Type": "application/json"} if body else None)


# ---------- Calendar (ACT-5)
CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


def create_event(token: str, event: dict) -> dict:
    out = _json("POST", CAL, token, {
        "summary": event["title"], "location": event.get("location") or None,
        "description": event.get("description") or None,
        "start": {"dateTime": event["start"], "timeZone": settings.timezone},
        "end": {"dateTime": event["end"], "timeZone": settings.timezone}})
    return {"provider": "google_calendar", "id": out["id"], "url": out.get("htmlLink")}


def delete_event(token: str, event_id: str):
    _request("DELETE", f"{CAL}/{urllib.parse.quote(event_id)}", token)


# ---------- Tasks (ACT-6)
TASKS = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks"


def create_task(token: str, task: dict) -> dict:
    payload = {"title": task["title"], "notes": task.get("notes") or None}
    if task.get("due"):
        payload["due"] = f"{task['due']}T00:00:00.000Z"  # Tasks keeps only the date
    out = _json("POST", TASKS, token, payload)
    return {"provider": "google_tasks", "id": out["id"], "url": out.get("webViewLink")}


def delete_task(token: str, task_id: str):
    _request("DELETE", f"{TASKS}/{urllib.parse.quote(task_id)}", token)


# ---------- Drive (ACT-7): a Google Doc made from plain text
DRIVE = "https://www.googleapis.com/drive/v3/files"


def create_doc(token: str, title: str, text: str) -> dict:
    boundary = uuid.uuid4().hex
    meta = json.dumps({"name": title, "mimeType": "application/vnd.google-apps.document"})
    body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
            f"--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{text}\r\n--{boundary}--").encode()
    out = _request("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
                   token, body, {"Content-Type": f"multipart/related; boundary={boundary}"})
    return {"provider": "google_drive", "id": out["id"], "url": out.get("webViewLink")}


def trash_file(token: str, file_id: str):
    """Undo moves the doc to Drive's trash (recoverable for 30 days) rather than deleting it."""
    _json("PATCH", f"{DRIVE}/{urllib.parse.quote(file_id)}", token, {"trashed": True})
