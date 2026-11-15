"""The doctor and the token helper, offline: readiness reads settings only, live steps refuse when not set up,
and nothing here sends anything."""
from actions import chert, email, google
from core.config import settings
from scripts import actions_doctor, google_token


def state(area):
    return next(s for a, s, _ in actions_doctor.readiness() if a == area)


def test_readiness_names_what_is_missing_not_values(client, monkeypatch):
    for k in ("email_provider", "email_from", "email_api_key", "chert_api_key", "google_refresh_token"):
        monkeypatch.setattr(settings, k, "")
    detail = {a: d for a, _, d in actions_doctor.readiness()}
    assert state("email") == "missing" and "EMAIL_FROM" in detail["email"]
    assert state("google") == "missing" and "GOOGLE_REFRESH_TOKEN" in detail["google"]
    monkeypatch.setattr(settings, "email_provider", "resend")
    monkeypatch.setattr(settings, "email_from", "Cortex <hi@secret-domain.test>")
    monkeypatch.setattr(settings, "email_api_key", "re_super_secret")
    assert state("email") == "dry_run"
    monkeypatch.setattr(settings, "email_dry_run", False)
    out = " ".join(d for _, _, d in actions_doctor.readiness())
    assert state("email") == "ready" and "re_super_secret" not in out and "secret-domain" not in out


def test_live_steps_refuse_without_setup(client, monkeypatch):
    sent = []
    monkeypatch.setattr(email, "send", lambda *a: sent.append(a))
    monkeypatch.setattr(chert, "send", lambda *a: sent.append(a))
    monkeypatch.setattr(settings, "email_dry_run", True)
    monkeypatch.setattr(settings, "message_dry_run", True)
    ok, msg = actions_doctor.live_email("a@b.test")
    assert not ok and "EMAIL_DRY_RUN=false" in msg
    ok, msg = actions_doctor.live_text("+15555550123")
    assert not ok and "MESSAGE_DRY_RUN=false" in msg
    monkeypatch.setattr(google, "resolve_token", lambda t: None)
    assert actions_doctor.live_google()[0][0] is False
    assert not sent


def test_live_google_creates_then_undoes_each_thing(client, monkeypatch):
    log = []
    monkeypatch.setattr(google, "resolve_token", lambda t: "tok")
    for name, provider in (("create_event", "google_calendar"), ("create_task", "google_tasks"),
                           ("create_doc", "google_drive")):
        monkeypatch.setattr(google, name,
                            lambda tok, *a, p=provider: log.append(("make", p)) or {"provider": p, "id": f"{p}_1", "url": None})
    for name in ("delete_event", "delete_task", "trash_file"):
        monkeypatch.setattr(google, name, lambda tok, i, n=name: log.append(("undo", n, i)))
    steps = actions_doctor.live_google()
    assert all(ok for ok, _ in steps) and [x[0] for x in log] == ["make", "undo"] * 3


def test_a_failed_undo_tells_you_to_remove_it_by_hand(client, monkeypatch):
    monkeypatch.setattr(google, "resolve_token", lambda t: "tok")
    monkeypatch.setattr(google, "create_event", lambda *a: {"provider": "google_calendar", "id": "e1", "url": "https://x.test/e1"})
    monkeypatch.setattr(google, "create_task", lambda *a: {"provider": "google_tasks", "id": "t1", "url": None})
    monkeypatch.setattr(google, "create_doc", lambda *a: {"provider": "google_drive", "id": "d1", "url": None})

    def boom(*a):
        raise google.GoogleError("403")

    monkeypatch.setattr(google, "delete_event", boom)
    monkeypatch.setattr(google, "delete_task", lambda *a: None)
    monkeypatch.setattr(google, "trash_file", lambda *a: None)
    bad = [m for ok, m in actions_doctor.live_google() if not ok]
    assert len(bad) == 1 and "by hand" in bad[0] and "https://x.test/e1" in bad[0]


def test_env_file_update_replaces_or_appends(tmp_path):
    p = tmp_path / ".env"
    google_token.set_env_value(p, "GOOGLE_REFRESH_TOKEN", "abc")
    assert p.read_text() == "GOOGLE_REFRESH_TOKEN=abc\n"
    p.write_text("A=1\n# GOOGLE_REFRESH_TOKEN=\nB=2\n")
    google_token.set_env_value(p, "GOOGLE_REFRESH_TOKEN", "xyz")
    assert p.read_text() == "A=1\nGOOGLE_REFRESH_TOKEN=xyz\nB=2\n"
    google_token.set_env_value(p, "GOOGLE_REFRESH_TOKEN", "new")
    assert p.read_text().count("GOOGLE_REFRESH_TOKEN") == 1 and "new" in p.read_text()


def test_consent_url_asks_for_offline_access_and_the_same_three_scopes():
    url = google_token.auth_url("cid", "http://localhost:3000/api/auth/callback/google", "st")
    assert "access_type=offline" in url and "prompt=consent" in url
    for scope in ("calendar.events", "auth%2Ftasks", "drive.file"):
        assert scope in url
