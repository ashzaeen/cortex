"""Model calls for the content features (brief, digest highlights, recap, generate, caregiver note): one place that
picks the real model or the offline stand-in, so skills never branch on it. Prompts are in core/content_prompts.py,
the offline answers in core/content_mock.py. Kept apart from core/llm.py so the perception prompt and the older calls
stay untouched."""
from core import content_mock, content_prompts
from core.llm import get_llm


def run(task: str, image: bytes | None = None, **kw) -> dict:
    llm = get_llm()
    if getattr(llm, "is_mock", False):
        return content_mock.run(task, **kw)
    from google.genai import types

    parts = [types.Part.from_bytes(data=image, mime_type="image/jpeg")] if image else []
    prompt = content_prompts.PROMPTS[task].format(**{k: "" if v is None else v for k, v in kw.items()})
    return llm._json(prompt, parts, model=llm.vision_model if parts else llm.model,
                     temperature=content_prompts.TEMPERATURE.get(task, 0.3),
                     thinking_budget=content_prompts.THINKING.get(task)) or {}
