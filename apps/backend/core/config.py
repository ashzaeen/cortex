"""Settings from env. Reads the repo-root .env, then apps/backend/.env (wins). Names follow the root
.env.example where one exists (DATABASE_URL, LLM_*, EMAIL_*, SNAPSHOT_STORE)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent.parent

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v in (None, "") else v.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name) or default)
    except ValueError:
        return default


def _path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


@dataclass
class Settings:
    # Store
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    mongodb_db: str = field(default_factory=lambda: os.getenv("MONGODB_DB", "cortex"))
    vector_index: str = field(default_factory=lambda: os.getenv("MONGO_VECTOR_INDEX", "moment_vectors"))
    use_mongomock: bool = field(default_factory=lambda: _bool("USE_MONGOMOCK", False))
    tiger_url: str = field(default_factory=lambda: os.getenv("TIGER_DATABASE_URL", ""))
    snapshot_store: Path = field(default_factory=lambda: _path(os.getenv("SNAPSHOT_STORE", "./data/snapshots")))
    video_store: Path = field(default_factory=lambda: _path(os.getenv("VIDEO_STORE", "./data/videos")))

    # Models
    llm_provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "gemini"))
    llm_model: str = field(default_factory=lambda: os.getenv("LLM_MODEL") or "gemini-3.5-flash-lite")
    llm_api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY", ""))
    vision_model: str = field(default_factory=lambda: os.getenv("VISION_MODEL", ""))
    embed_model: str = field(default_factory=lambda: os.getenv("EMBED_MODEL", "gemini-embedding-001"))
    embed_dim: int = field(default_factory=lambda: _int("EMBED_DIM", 768))
    llm_mock: bool = field(default_factory=lambda: _bool("LLM_MOCK", False))

    # Server
    public_url: str = field(default_factory=lambda: os.getenv("PUBLIC_URL", "http://localhost:8000").rstrip("/"))
    cors_origins: str = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "*"))
    # Shared key every client sends (X-Cortex-Key or Authorization: Bearer). Empty = open (local dev, tests).
    api_key: str = field(default_factory=lambda: os.getenv("CORTEX_API_KEY", ""))
    timezone: str = field(default_factory=lambda: os.getenv("CORTEX_TZ", "America/Chicago"))

    # Email action
    email_dry_run: bool = field(default_factory=lambda: _bool("EMAIL_DRY_RUN", True))
    email_provider: str = field(default_factory=lambda: os.getenv("EMAIL_PROVIDER", ""))
    email_from: str = field(default_factory=lambda: os.getenv("EMAIL_FROM", ""))
    email_api_key: str = field(default_factory=lambda: os.getenv("EMAIL_API_KEY", ""))
    smtp_host: str = field(default_factory=lambda: os.getenv("SMTP_HOST", "smtp.gmail.com"))
    smtp_port: int = field(default_factory=lambda: _int("SMTP_PORT", 587))
    undo_seconds: int = field(default_factory=lambda: _int("ACTION_UNDO_SECONDS", 30))

    # Google actions (calendar_event, reminder, flashcards, notes). The dashboard forwards the signed-in
    # user's access token per request; GOOGLE_REFRESH_TOKEN (with the same OAuth client as the
    # dashboard's sign-in) lets voice and call confirmations reach Google without the dashboard.
    google_client_id: str = field(default_factory=lambda: os.getenv("AUTH_GOOGLE_ID", ""))
    google_client_secret: str = field(default_factory=lambda: os.getenv("AUTH_GOOGLE_SECRET", ""))
    google_refresh_token: str = field(default_factory=lambda: os.getenv("GOOGLE_REFRESH_TOKEN", ""))

    # Text messages through the Chert line (message). MESSAGE_DRY_RUN=true (default) never sends.
    message_dry_run: bool = field(default_factory=lambda: _bool("MESSAGE_DRY_RUN", True))
    chert_api_url: str = field(default_factory=lambda: os.getenv("CHERT_API_URL", "https://app.trychert.com/api/v1").rstrip("/"))
    chert_api_key: str = field(default_factory=lambda: os.getenv("CHERT_API_KEY", ""))
    chert_project_id: str = field(default_factory=lambda: os.getenv("CHERT_PROJECT_ID", ""))
    chert_line_id: str = field(default_factory=lambda: os.getenv("CHERT_LINE_ID", ""))

    # Memory behaviour
    person_window_minutes: int = field(default_factory=lambda: _int("PERSON_WINDOW_MINUTES", 5))
    recent_merge_minutes: int = field(default_factory=lambda: _int("RECENT_MERGE_MINUTES", 15))


settings = Settings()


def reload_settings(**overrides) -> Settings:
    """Tests call this to switch to mongomock + mock LLM."""
    global settings
    new = Settings()
    for k, v in overrides.items():
        setattr(new, k, v)
    settings.__dict__.update(new.__dict__)
    return settings
