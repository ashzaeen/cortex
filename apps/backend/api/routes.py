"""Every operation in contracts/openapi.yaml, with the same paths, bodies and response shapes.
Handlers are sync (FastAPI runs them in a thread pool), so blocking model and DB calls are safe."""
import asyncio

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from actions import doers, followup
from api import models
from core import db, events, receipts, snapshots, tiger, videos
from core.config import REPO_ROOT, settings
from core.errors import ApiError, not_found
from core.llm import get_llm
from core.timeutil import parse_dt
from memory import delete, ingest, search, store
from skills import ask as ask_skill
from skills import brief, network, promises

router = APIRouter()


# ---------- health ----------
@router.get("/health", tags=["health"])
def get_health():
    return {"ok": True, "store": {"mongo": db.ping(), "mock": db.is_mock()}, "tiger": tiger.enabled(),
            "llm_mock": getattr(get_llm(), "is_mock", False), "email_dry_run": settings.email_dry_run}


# ---------- moments ----------
@router.post("/moments", status_code=201, tags=["moments"])
def ingest_moment(body: models.MomentIngest):
    return ingest.ingest(body.model_dump())


@router.get("/moments", tags=["moments"])
def list_moments(since: str | None = None, limit: int = Query(50, ge=1, le=200)):
    return {"items": store.list_moments(parse_dt(since), limit)}


@router.get("/moments/search", tags=["moments"])
def search_moments(q: str = Query(min_length=1), limit: int = Query(5, ge=1, le=50)):
    from core import contract

    return {"results": [{"moment": contract.moment(d), "score": round(s, 4)} for d, s in search.search(q, limit)]}


@router.delete("/moments/{id}", tags=["privacy"])
def delete_moment(id: str):  # noqa: A002
    return delete.delete_moment(id)


# ---------- ask ----------
@router.post("/ask", tags=["ask"])
def ask(body: models.AskBody):
    return ask_skill.ask(body.question, body.channel)


# ---------- people ----------
@router.get("/people", tags=["people"])
def list_people():
    return {"items": network.list_all()}


@router.post("/people", status_code=201, tags=["people"])
def create_person(body: models.PersonCreate):
    return network.create_manual(body.name, body.company, body.introduced_moment_id)


@router.get("/people/{id}/brief", tags=["people"])
def brief_person(id: str):  # noqa: A002
    return brief.brief(id)


# ---------- promises ----------
@router.get("/promises", tags=["promises"])
def list_promises(status: str | None = Query(None, pattern="^(proposed|confirmed|done|dismissed)$"),
                  direction: str | None = Query(None, pattern="^(waiting_on|i_owe)$"), person_id: str | None = None):
    return {"items": promises.list_filtered(status, direction, person_id)}


@router.post("/promises", status_code=201, tags=["promises"])
def create_promise(body: models.PromiseCreate):
    return promises.create(body.model_dump())


@router.post("/promises/{id}/confirm", tags=["promises"])
def confirm_promise(id: str):  # noqa: A002
    return promises.confirm(id)


# ---------- actions ----------
@router.get("/actions", tags=["actions"])
def list_actions(status: str | None = Query(None, pattern="^(proposed|sent|draft_saved|done|undone|dismissed|failed)$"),
                 mode: str | None = Query(None, pattern="^(focus|student|life|assist)$")):
    return {"items": followup.list_actions(status, mode)}


@router.post("/actions/propose", status_code=201, tags=["actions"])
def propose_action(body: models.ActionPropose):
    if body.type == "follow_up_email":
        if not body.person_id:
            raise ApiError(400, "bad_request", "person_id is required for follow_up_email.")
        return followup.propose(body.person_id, body.source_moment_ids)
    return doers.propose(body.model_dump(mode="json", exclude_none=True))


# The dashboard proxy forwards the signed-in user's Google access token for the Google actions.
GoogleToken = Header(None, alias="X-Google-Access-Token", include_in_schema=False)


@router.post("/actions/{id}/confirm", tags=["actions"])
def confirm_action(id: str, body: models.ActionConfirm, google_token: str | None = GoogleToken):  # noqa: A002
    return followup.confirm(id, body.deliver, body.draft.model_dump() if body.draft else None, google_token)


@router.post("/actions/{id}/undo", tags=["actions"])
def undo_action(id: str, google_token: str | None = GoogleToken):  # noqa: A002
    return followup.undo(id, google_token)


# ---------- receipts ----------
@router.get("/receipts", tags=["receipts"])
def list_receipts():
    return {"items": receipts.list_all()}


# ---------- privacy ----------
@router.get("/privacy", tags=["privacy"])
def get_privacy():
    return store.privacy_out()


@router.post("/privacy/pause", tags=["privacy"])
def set_privacy(body: models.PrivacySet):
    return store.set_privacy(body.state)


# ---------- modes ----------
@router.get("/modes", tags=["modes"])
def list_modes():
    return {"items": store.list_modes()}


@router.post("/modes/{id}/activate", tags=["modes"])
def activate_mode(id: str):  # noqa: A002
    mode = store.set_active_mode(id)
    if mode is None:
        raise not_found("mode")
    events.publish("mode.changed", mode)
    return mode


# ---------- events (SSE) ----------
@router.get("/events", tags=["events"])
async def stream_events(request: Request):
    sub = events.subscribe()

    async def gen():
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                try:
                    msg = await asyncio.wait_for(sub[1].get(), timeout=15)
                    yield events.format_sse(msg)
                except TimeoutError:
                    yield ": ping\n\n"
        finally:
            events.unsubscribe(sub)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- snapshot files (additive, outside the contract: lets clients load snapshot_url) ----------
@router.get("/snapshots/{name}", include_in_schema=False)
def get_snapshot(name: str):
    found = snapshots.read(name)
    if not found:
        raise not_found("snapshot")
    data, content_type = found
    # Names are unique and never reused, so the bytes behind a URL never change.
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/videos/{name}", include_in_schema=False)
def get_video(name: str):
    path = videos.cached_path(name)
    if not path:
        raise not_found("video")
    return FileResponse(path, media_type="video/quicktime")


@router.get("/fixtures/snapshots/{name}", include_in_schema=False)
def get_fixture_snapshot(name: str):
    base = REPO_ROOT / "fixtures" / "snapshots"
    path = base / name
    if path.parent != base or not path.is_file():
        raise not_found("snapshot")
    return FileResponse(path)
