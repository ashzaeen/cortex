"""Cortex backend: FastAPI app implementing contracts/openapi.yaml.  Run: make dev  (port 8000)"""
import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from api.routes import router
from api.skills_routes import router as skills_router
from core import db, errors, tiger, user
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
    if os.getenv("SYNC_BACKGROUND", "").lower() not in {"1", "true"}:  # tests drive routines.tick() themselves
        from skills import routines

        routines.start_ticker()
        from skills import skill_ticker

        skill_ticker.start()
    yield


OPEN_PATHS = {"/health"}  # Railway and CI health checks


def _presented_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return request.headers.get("x-cortex-key") or (auth[7:] if auth.lower().startswith("bearer ") else "")


def create_app() -> FastAPI:
    app = FastAPI(title="Cortex API", version="0.1.0", lifespan=lifespan)

    @app.middleware("http")
    async def key_then_user(request: Request, call_next):
        """1. With CORTEX_API_KEY set, every route but /health needs the key: memory is private.
        2. Only then, X-Cortex-User picks whose memory this request reads and writes (core/user.py).
        One middleware, so an unauthenticated request can never pick (or create) a user's memory."""
        open_path = request.url.path in OPEN_PATHS
        if settings.api_key and request.method != "OPTIONS" and not open_path:
            if not hmac.compare_digest(_presented_key(request).encode(), settings.api_key.encode()):
                return JSONResponse({"error": {"code": "unauthorized", "message": "Missing or wrong Cortex API key."}},
                                    status_code=401)
        who = user.normalize(request.headers.get("x-cortex-user"))
        token = user.set_current(who)
        try:
            if not open_path and request.method != "OPTIONS":
                await run_in_threadpool(user.carry(user.ensure_ready), who)
            return await call_next(request)
        finally:
            user._current.reset(token)

    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                       allow_methods=["*"], allow_headers=["*"])
    errors.register(app)
    app.include_router(router)
    app.include_router(skills_router)
    return app


app = create_app()
