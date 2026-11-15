"""Request bodies, mirroring contracts/openapi.yaml. Bad input returns 400 in the contract error shape."""
from typing import Literal

from pydantic import BaseModel, Field


class MomentIngest(BaseModel):
    ts: str
    source: Literal["glasses", "phone", "call", "dashboard"]
    mode: Literal["focus", "student", "life", "assist"] | None = None
    transcript: str | None = None
    audio_base64: str | None = None
    snapshot_base64: str | None = None
    snapshot_url: str | None = None
    video_base64: str | None = None
    call_id: str | None = None


class AskBody(BaseModel):
    question: str = Field(min_length=1)
    channel: Literal["voice", "dashboard", "call"]


class PersonCreate(BaseModel):
    name: str = Field(min_length=1)
    company: str | None = None
    introduced_moment_id: str


class PromiseCreate(BaseModel):
    direction: Literal["waiting_on", "i_owe"]
    person_id: str
    what: str
    due_text: str | None = None
    source_moment_id: str


class ActionPropose(BaseModel):
    type: Literal["follow_up_email"]
    person_id: str
    source_moment_ids: list[str] | None = None


class DraftEdits(BaseModel):
    to: str | None = None
    subject: str | None = None
    body: str | None = None


class ActionConfirm(BaseModel):
    deliver: Literal["send", "draft"]
    draft: DraftEdits | None = None


class PrivacySet(BaseModel):
    state: Literal["capturing", "paused", "off_record"]
