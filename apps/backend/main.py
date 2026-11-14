"""Cortex backend: FastAPI app implementing contracts/openapi.yaml.  Run: make dev  (port 8000)"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


def create_app() -> FastAPI:
    app = FastAPI(title="Cortex API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                       allow_methods=["*"], allow_headers=["*"])
    errors.register(app)
    app.include_router(router)
    return app


app = create_app()
