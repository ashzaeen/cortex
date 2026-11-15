"""The skills' operations in contracts/openapi.yaml (tag: skills). Kept apart from routes.py so the skills and the
modes can change without touching each other. Handlers are sync (FastAPI runs them in a thread pool)."""
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from skills import autobrief, coach, immersion, kit, nudges, people_search, proactive, promises, registry, translate, world

router = APIRouter(tags=["skills"])
Source = Literal["glasses", "device"]
MomentId = Annotated[str, Field(pattern=r"^mom_")]
HHMM = Annotated[str, Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")]


class View(BaseModel):
    snapshot_base64: str | None = None
    moment_id: MomentId | None = None
    source: Source | None = None


class WorldBody(View):
    question: str | None = None
    save: bool = True


class TranslateBody(BaseModel):
    text: str | None = None
    audio_base64: str | None = None
    target_language: str | None = None
    source_language: str | None = None
    save: bool = False


class NameBody(View):
    language: str | None = None


class QuizAnswer(BaseModel):
    vocab_id: str
    answer: str


class CoachStart(View):
    goal: str = Field(min_length=1)


class CoachStep(View):
    said: str | None = None


class TranslateSettings(BaseModel):
    target_language: str | None = None
    source_language: str | None = None


class ImmersionSettings(BaseModel):
    language: str | None = None


class ProactiveSettings(BaseModel):
    enabled: bool | None = None
    dwell_seconds: int | None = Field(None, ge=0, le=600)
    cooldown_minutes: int | None = Field(None, ge=0, le=1440)


class NudgeSettings(BaseModel):
    enabled: bool | None = None
    quiet_start: HHMM | None = None
    quiet_end: HHMM | None = None
    daily_cap: int | None = Field(None, ge=0, le=20)


class AutoBriefSettings(BaseModel):
    enabled: bool | None = None


class BriefCall(BaseModel):
    person_id: str


class CallStatus(BaseModel):
    status: Literal["dialing", "completed", "failed"]


def _patch(body: BaseModel) -> dict:
    return body.model_dump(exclude_none=True)


# ---------- registry and view ----------
@router.get("/skills")
def list_skills():
    return {"items": registry.listing()}


@router.get("/skills/view")
def glasses_view():
    return kit.glasses_status()


@router.get("/skills/people/search")
def search_people(q: str = Query(min_length=1), limit: int = Query(10, ge=1, le=50)):
    return {"items": people_search.search_people(q, limit)}


# ---------- SKL-4 world ----------
@router.post("/skills/world")
def ask_world(body: WorldBody):
    return world.answer(body.question, body.snapshot_base64, body.moment_id, body.source, body.save)


# ---------- SKL-5 translate ----------
@router.post("/skills/translate")
def do_translate(body: TranslateBody):
    return translate.translate(body.text, body.audio_base64, body.target_language, body.source_language, body.save)


@router.get("/skills/translate/settings")
def get_translate_settings():
    return translate.settings()


@router.put("/skills/translate/settings")
def put_translate_settings(body: TranslateSettings):
    return translate.settings(_patch(body))


# ---------- SKL-6 immersion ----------
@router.post("/skills/immersion/name")
def name_objects(body: NameBody):
    return immersion.name_objects(body.language, body.snapshot_base64, body.moment_id, body.source)


@router.get("/skills/immersion/vocab")
def list_vocab(language: str | None = None):
    return {"items": immersion.list_vocab(language)}


@router.delete("/skills/immersion/vocab/{id}")
def delete_vocab(id: str):  # noqa: A002
    return immersion.delete(id)


@router.get("/skills/immersion/quiz")
def get_quiz(language: str | None = None):
    return immersion.quiz(language)


@router.post("/skills/immersion/quiz")
def answer_quiz(body: QuizAnswer):
    return immersion.answer(body.vocab_id, body.answer)


@router.get("/skills/immersion/settings")
def get_immersion_settings():
    return immersion.settings()


@router.put("/skills/immersion/settings")
def put_immersion_settings(body: ImmersionSettings):
    return immersion.settings(_patch(body))


# ---------- SKL-7 proactive nudge ----------
@router.get("/skills/proactive/settings")
def get_proactive_settings():
    return proactive.settings()


@router.put("/skills/proactive/settings")
def put_proactive_settings(body: ProactiveSettings):
    return proactive.settings(_patch(body))


@router.post("/skills/proactive/observe")
def observe(body: View):
    return proactive.observe(body.snapshot_base64, body.moment_id, body.source)


@router.get("/skills/proactive/offers")
def list_offers():
    return {"items": proactive.list_offers()}


@router.post("/skills/proactive/offers/{id}/accept")
def accept_offer(id: str, body: View | None = None):  # noqa: A002
    body = body or View()
    return proactive.accept(id, body.snapshot_base64, body.source)


@router.post("/skills/proactive/offers/{id}/dismiss")
def dismiss_offer(id: str):  # noqa: A002
    return proactive.dismiss(id)


# ---------- SKL-8 coach ----------
@router.post("/skills/coach", status_code=201)
def start_coach(body: CoachStart):
    return coach.start(body.goal, body.snapshot_base64, body.moment_id, body.source)


@router.get("/skills/coach")
def list_coach():
    return {"items": coach.list_recent()}


@router.get("/skills/coach/{id}")
def get_coach(id: str):  # noqa: A002
    return coach.get(id)


@router.post("/skills/coach/{id}/step")
def coach_step(id: str, body: CoachStep):  # noqa: A002
    return coach.step(id, body.snapshot_base64, body.said, body.source)


@router.post("/skills/coach/{id}/end")
def end_coach(id: str):  # noqa: A002
    return coach.end(id)


# ---------- SKL-2 nudges and close out ----------
@router.get("/skills/nudges/settings")
def get_nudge_settings():
    return nudges.settings()


@router.put("/skills/nudges/settings")
def put_nudge_settings(body: NudgeSettings):
    return nudges.settings(_patch(body))


@router.get("/skills/nudges")
def list_nudges():
    return {"items": nudges.list_today()}


@router.post("/skills/nudges/tick")
def tick_nudges():
    return {"items": nudges.tick()}


@router.post("/skills/nudges/{id}/dismiss")
def dismiss_nudge(id: str):  # noqa: A002
    return nudges.dismiss(id)


@router.post("/promises/{id}/done", tags=["promises"])
def done_promise(id: str):  # noqa: A002
    return promises.complete(id)


@router.post("/promises/{id}/dismiss", tags=["promises"])
def dismiss_promise(id: str):  # noqa: A002
    return promises.dismiss(id)


# ---------- SKL-3 automatic brief and brief by call ----------
@router.get("/skills/brief/settings")
def get_autobrief_settings():
    return autobrief.settings()


@router.put("/skills/brief/settings")
def put_autobrief_settings(body: AutoBriefSettings):
    return autobrief.settings(_patch(body))


@router.post("/skills/brief/tick")
def tick_autobrief():
    return {"items": autobrief.tick()}


@router.post("/skills/brief/call", status_code=201)
def brief_call(body: BriefCall):
    return autobrief.request_call(body.person_id)


@router.get("/skills/brief/call/{id}")
def get_brief_call(id: str):  # noqa: A002
    return autobrief.get_call(id)


@router.patch("/skills/brief/call/{id}")
def set_brief_call(id: str, body: CallStatus):  # noqa: A002
    return autobrief.mark_call(id, body.status)
