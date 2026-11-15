"""Request bodies, mirroring contracts/openapi.yaml. Bad input returns 400 in the contract error shape."""
from datetime import date, datetime
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


class EventIn(BaseModel):
    title: str
    start: datetime
    end: datetime
    location: str | None = None
    description: str | None = None


class TaskIn(BaseModel):
    title: str
    notes: str | None = None
    due: date | None = None


class DocIn(BaseModel):
    title: str
    body: str


class MessageIn(BaseModel):
    to: str = Field(pattern=r"^\+[1-9][0-9]{6,14}$")
    text: str = Field(max_length=4000)


class ActionPropose(BaseModel):
    type: Literal["follow_up_email", "flashcards", "reminder", "read_aloud", "calendar_event", "notes", "message"]
    person_id: str | None = None
    source_moment_ids: list[str] | None = None
    mode: Literal["focus", "student", "life", "assist"] | None = None
    title: str | None = None
    summary: str | None = None
    event: EventIn | None = None
    task: TaskIn | None = None
    doc: DocIn | None = None
    message: MessageIn | None = None


class DraftEdits(BaseModel):
    to: str | None = None
    subject: str | None = None
    body: str | None = None


class ActionConfirm(BaseModel):
    deliver: Literal["send", "draft", "do"]
    draft: DraftEdits | None = None


class PrivacySet(BaseModel):
    state: Literal["capturing", "paused", "off_record"]


class PersonUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    company: str | None = None
    role: str | None = None
    notes: str | None = None
    topics: list[str] | None = None


class ListItemCreate(BaseModel):
    text: str = Field(min_length=1, max_length=200)
    amount: float | None = None
    source_moment_id: str | None = None


class ListItemUpdate(BaseModel):
    text: str | None = Field(None, min_length=1, max_length=200)
    amount: float | None = None
    done: bool | None = None
