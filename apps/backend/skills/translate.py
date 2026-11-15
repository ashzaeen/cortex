"""SKL-5 Live translation: hear a phrase, get the translation spoken in your ear.

Trigger: the Translate tab, or "Cortex, translate that" on the glasses. Inputs: text or audio, a target language
(default from settings) and an optional source language (default auto-detect). Steps: transcribe if audio,
translate, speak it. Output: original, translation, detected language. Confirmation: none. Undo: nothing is
stored unless save is true; a saved phrase is a moment and deletable. Source moment: only when saved.
If unsure: an empty or low-confidence translation says it could not translate and shows the original."""
from core import contract
from core.errors import ApiError
from core.llm import get_llm
from skills import kit

DEFAULTS = {"target_language": "spanish", "source_language": "auto"}


def settings(patch: dict | None = None) -> dict:
    if patch:
        for k in ("target_language", "source_language"):
            if k in patch and not str(patch[k] or "").strip():
                raise ApiError(400, "bad_request", f"{k} cannot be empty.")
        patch = {k: str(v).strip().lower() for k, v in patch.items()}
        return kit.save_settings("translate", DEFAULTS, patch)
    return kit.get_settings("translate", DEFAULTS)


def translate(text: str | None, audio_base64: str | None = None, target: str | None = None, source: str | None = None,
              save: bool = False) -> dict:
    cfg = settings()
    target = (target or cfg["target_language"]).strip().lower()
    source = (source or cfg["source_language"]).strip().lower()
    heard = (text or "").strip()
    audio = kit.decode(audio_base64)
    if audio and not heard:
        heard = get_llm().transcribe(audio).strip()
    if not heard:
        raise ApiError(400, "bad_request", "Send text, or audio_base64 that has speech in it.")
    data = get_llm().skill("translate", None, text=heard, target=target, source=source) or {}
    translation = (data.get("translation") or "").strip()
    confidence = max(0.0, min(1.0, float(data.get("confidence") or 0)))
    unsure = not translation or confidence < 0.5
    spoken = "I couldn't translate that." if not translation else translation
    moment = None
    if save and translation:
        try:
            doc = kit.save_moment(transcript=f"{heard} -> {translation}", caption=f"Translated to {target}", image=None,
                                  tags=["skill:translate"])
            moment = contract.moment(doc)
        except ApiError:
            moment = None
    return kit.say(spoken, translation or spoken, original=heard, translation=translation,
                   source_language=data.get("source_language") or "Unknown", target_language=target,
                   confidence=round(confidence, 2), unsure=unsure, moment=moment)
