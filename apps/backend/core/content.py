"""Model calls for the content features (brief, digest highlights, recap, generate, caregiver note): one place that
picks the real model or the offline stand-in, so skills never branch on it. Prompts are in core/content_prompts.py,
the offline answers in core/content_mock.py. Kept apart from core/llm.py so the perception prompt and the older calls
stay untouched."""
import inspect

from core import content_mock, content_prompts
from core.llm import get_llm


def run(name: str, image: bytes | None = None, /, **kw) -> dict:
    llm = get_llm()
    kw.setdefault("image_note", "One image from the wearer's point of view is attached." if image else "No image is attached.")
    # Render the real prompt even when the offline stand-in answers, so a missing or misspelled slot fails in the normal
    # test run instead of only on the real model.
    prompt = content_prompts.PROMPTS[name].format(**{k: "" if v is None else v for k, v in kw.items()})
    if getattr(llm, "is_mock", False):
        return content_mock.run(name, **kw)
    from google.genai import types

    parts = [types.Part.from_bytes(data=image, mime_type="image/jpeg")] if image else []
    extra = {}
    budget = content_prompts.THINKING.get(name)
    if budget is not None and "thinking_budget" in inspect.signature(llm._json).parameters:  # older llm.py: just skip it
        extra["thinking_budget"] = budget
    return llm._json(prompt, parts, model=llm.vision_model if parts else llm.model,
                     temperature=content_prompts.TEMPERATURE.get(name, 0.3), **extra) or {}
