"""Get a GOOGLE_REFRESH_TOKEN so the backend can write to Calendar, Tasks and Drive when you approve by voice or
on a call, where the dashboard is not there to forward your sign-in (ACT-5..7, issue #52).

  python -m scripts.google_token

Run it yourself, on your machine. It opens Google's consent page for the Google account you pick, catches the
answer on the redirect address, and saves GOOGLE_REFRESH_TOKEN into apps/backend/.env (gitignored). The token is
never printed. It uses the same OAuth client as the dashboard sign-in (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET) and the
same three scopes, so Google asks for nothing new.

The default redirect is the dashboard's own, http://localhost:3000/api/auth/callback/google, which is already on
the OAuth client. Stop the dashboard dev server first so this script can listen on port 3000, or pass
--redirect with an address you added to the client yourself, for example http://localhost:8765/."""
import argparse
import http.server
import json
import re
import secrets
import threading
import urllib.parse
import urllib.request
import webbrowser

from core.config import BACKEND_DIR, settings

SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/tasks",
          "https://www.googleapis.com/auth/drive.file"]
DEFAULT_REDIRECT = "http://localhost:3000/api/auth/callback/google"


def auth_url(client_id: str, redirect: str, state: str) -> str:
    q = {"client_id": client_id, "redirect_uri": redirect, "response_type": "code", "scope": " ".join(SCOPES),
         "access_type": "offline", "prompt": "consent", "state": state}
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(q)


def set_env_value(path, key: str, value: str) -> None:
    """Set KEY=value in a .env file, replacing an existing line (even an empty or commented-out one) or appending."""
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    line = f"{key}={value}"
    pattern = re.compile(rf"^\s*#?\s*{re.escape(key)}=.*$", re.M)
    if pattern.search(text):
        text = pattern.sub(lambda _: line, text, count=1)
    else:
        text = text.rstrip("\n") + ("\n" if text else "") + line + "\n"
    path.write_text(text, encoding="utf-8")


def _wait_for_code(redirect: str, state: str, timeout: float = 300) -> str:
    u = urllib.parse.urlparse(redirect)
    box: dict = {}
    done = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != u.path:
                self.send_response(404)
                self.end_headers()
                return
            q = urllib.parse.parse_qs(parsed.query)
            box["code"] = (q.get("code") or [""])[0] if (q.get("state") or [""])[0] == state else ""
            box["error"] = (q.get("error") or [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Cortex got your Google permission. You can close this tab.")
            done.set()

        def log_message(self, *_):
            pass

    srv = http.server.HTTPServer((u.hostname or "localhost", u.port or 80), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    ok = done.wait(timeout)
    srv.shutdown()
    if not ok:
        raise SystemExit("Timed out waiting for Google. Run it again.")
    if box.get("error") or not box.get("code"):
        raise SystemExit(f"Google did not give permission ({box.get('error') or 'bad state'}). Nothing was saved.")
    return box["code"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--redirect", default=DEFAULT_REDIRECT)
    args = ap.parse_args(argv)
    if not (settings.google_client_id and settings.google_client_secret):
        raise SystemExit("Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET first (the same OAuth client as the dashboard sign-in).")
    state = secrets.token_urlsafe(16)
    url = auth_url(settings.google_client_id, args.redirect, state)
    print("Opening Google's consent page. Pick the account whose Calendar, Tasks and Drive Cortex should use.")
    webbrowser.open(url)
    print("If nothing opened, paste this address into your browser:\n" + url)
    code = _wait_for_code(args.redirect, state)
    body = urllib.parse.urlencode({"code": code, "client_id": settings.google_client_id,
                                   "client_secret": settings.google_client_secret,
                                   "redirect_uri": args.redirect, "grant_type": "authorization_code"}).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed Google host)
            out = json.loads(resp.read())
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Google refused the code: {exc}") from exc
    token = out.get("refresh_token")
    if not token:
        raise SystemExit("Google gave no refresh token. Remove Cortex at myaccount.google.com/permissions and run this again.")
    set_env_value(BACKEND_DIR / ".env", "GOOGLE_REFRESH_TOKEN", token)
    print("Saved GOOGLE_REFRESH_TOKEN to apps/backend/.env. Check it with: python -m scripts.actions_doctor --google")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
