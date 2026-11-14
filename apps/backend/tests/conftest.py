"""Offline test setup: in-memory MongoDB, mock LLM, no Tiger Data, email dry run, sync background work.
Explicit overrides win over any local .env, so tests never touch real Atlas, Tiger or Gemini."""
import os

os.environ["SYNC_BACKGROUND"] = "true"
os.environ["SEED_ON_START"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from core import db, events, llm, tiger  # noqa: E402
from core.config import reload_settings  # noqa: E402


@pytest.fixture()
def client(tmp_path):
    reload_settings(use_mongomock=True, database_url="", tiger_url="", llm_mock=True, llm_api_key="",
                    email_dry_run=True, email_provider="", snapshot_store=tmp_path / "snapshots",
                    public_url="http://testserver", undo_seconds=30)
    llm.reset()
    tiger._pool = None
    db.init()
    db.reset()
    events.history.clear()
    from skills import brief

    brief.clear_cache()
    from main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def seeded(client):
    from scripts.seed import seed

    seed(reset=True)
    return client
