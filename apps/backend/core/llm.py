"""Gemini wrapper. All model calls go through here. LLM_MOCK=true (or no LLM_API_KEY) uses MockLLM."""
import json
import logging
import math
import re
import time

from core import prompts
from core.config import settings

log = logging.getLogger(__name__)
_instance = None


def get_llm():
    global _instance
    if _instance is None:
        if settings.llm_mock or not settings.llm_api_key:
            from core.llm_mock import MockLLM

            if not settings.llm_mock:
                log.warning("LLM_API_KEY is empty: using MockLLM (rule-based, no API calls).")
            _instance = MockLLM()
        else:
            _instance = GeminiLLM()
    return _instance


def reset():
    global _instance
    _instance = None


def parse_json(text: str) -> dict:
    if not text:
        return {}
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    for candidate in (cleaned, (re.search(r"\{.*\}", cleaned, re.DOTALL) or [None])[0]):
        if candidate:
            try:
                data = json.loads(candidate)
                return data if isinstance(data, dict) else {}
            except json.JSONDecodeError:
                continue
    log.warning("Unparseable model output: %s", text[:200])
    return {}


def normalize(vec: list[float]) -> list[float]:
    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]


def audio_mime(data: bytes) -> str:
    if data[:4] == b"RIFF":
        return "audio/wav"
    if data[:4] == b"OggS":
        return "audio/ogg"
    if data[:4] == b"\x1aE\xdf\xa3":
        return "audio/webm"
    if data[4:8] == b"ftyp":
        return "audio/mp4"
    return "audio/mpeg"


class GeminiLLM:
    is_mock = False

    def __init__(self):
        from google import genai
        from google.genai import types

        # JSON mode (response_mime_type) is only on v1beta; newer SDKs default to v1 and return 400.
        self.client = genai.Client(api_key=settings.llm_api_key, http_options=types.HttpOptions(api_version="v1beta"))
        self.model = settings.llm_model
        self.vision_model = settings.vision_model or settings.llm_model

    def _json(self, prompt: str, parts=None, model: str | None = None, temperature: float = 0.2) -> dict:
        from google.genai import types

        contents = list(parts or []) + [prompt]
        config = types.GenerateContentConfig(response_mime_type="application/json", temperature=temperature)
        for attempt in range(3):
            try:
                resp = self.client.models.generate_content(model=model or self.model, contents=contents, config=config)
                return parse_json(resp.text or "")
            except Exception as exc:  # noqa: BLE001
                log.warning("Gemini call failed (attempt %d): %s", attempt + 1, exc)
                time.sleep(0.5 * (attempt + 1))
        return {}

    def embed(self, text: str, task: str = "RETRIEVAL_DOCUMENT") -> list[float]:
        from google.genai import types

        try:
            resp = self.client.models.embed_content(
                model=settings.embed_model, contents=(text or "empty")[:8000],
                config=types.EmbedContentConfig(task_type=task, output_dimensionality=settings.embed_dim))
            return normalize(list(resp.embeddings[0].values))
        except Exception as exc:  # noqa: BLE001
            log.error("Gemini embed failed: %s", exc)
            return []

    def transcribe(self, audio: bytes) -> str:
        from google.genai import types

        data = self._json(prompts.TRANSCRIBE, [types.Part.from_bytes(data=audio, mime_type=audio_mime(audio))])
        return (data.get("transcript") or "").strip()

    def perceive(self, *, transcript: str, image: bytes | None, mode: str, now_local: str, context: str,
                 speaker_rule: str) -> dict:
        from google.genai import types

        parts = [types.Part.from_bytes(data=image, mime_type="image/jpeg")] if image else []
        prompt = prompts.PERCEIVE.format(
            now_local=now_local, mode=mode, context=context, transcript=transcript or "",
            image_note="One image from the wearer's point of view is attached." if image else "No image.",
            speaker_rule=speaker_rule)
        return self._json(prompt, parts, model=self.vision_model if image else self.model)

    def answer(self, **kw) -> dict:
        return self._json(prompts.ANSWER.format(**kw), temperature=0.1)

    def brief(self, **kw) -> dict:
        return self._json(prompts.BRIEF.format(**kw), temperature=0.3)

    def follow_up(self, **kw) -> dict:
        return self._json(prompts.FOLLOW_UP.format(**kw), temperature=0.5)
