"""Cortex backend: FastAPI app implementing contracts/openapi.yaml.  Run: make dev  (port 8000)"""
import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes import router
from core import db, errors, tiger
from core.config import settings
from memory import store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
for noisy in ("pymongo", "httpx", "google_genai"):
    logging.getLogger(noisy).setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    tiger.init()
    store.ensure_modes()
    store.privacy()
    if db.is_mock() and db.col("moments").count_documents({}) == 0 and os.getenv("SEED_ON_START", "true") != "false":
        from scripts.seed import seed

        seed()  # in-memory store starts empty in each process, so seed it here for offline runs
    yield


OPEN_PATHS = {"/health"}  # Railway and CI health checks


def _presented_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return request.headers.get("x-cortex-key") or (auth[7:] if auth.lower().startswith("bearer ") else "")


def create_app() -> FastAPI:
    app = FastAPI(title="Cortex API", version="0.1.0", lifespan=lifespan)

    @app.middleware("http")
    async def require_key(request: Request, call_next):
        """With CORTEX_API_KEY set, every route but /health needs the key: memory is private."""
        if settings.api_key and request.method != "OPTIONS" and request.url.path not in OPEN_PATHS:
            if not hmac.compare_digest(_presented_key(request).encode(), settings.api_key.encode()):
                return JSONResponse({"error": {"code": "unauthorized", "message": "Missing or wrong Cortex API key."}},
                                    status_code=401)
        return await call_next(request)

    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                       allow_methods=["*"], allow_headers=["*"])
    errors.register(app)
    app.include_router(router)
    return app


app = create_app()
