"""SKL-4 Ask the world: "What is this?" for a plant, product or error screen; "Is this a good price?".

Trigger: the Ask the world tab, or "Cortex, what is this?" on the glasses. Inputs: the view (device camera, upload
or the latest glasses frame) and an optional question. Steps: look, answer in a sentence or two, save the view and
answer as a moment. Output: a spoken answer plus text. Confirmation: none (it only answers). Undo: delete the
moment (DELETE /moments/{id}). Source moment: the saved one. If unsure: it says "I'm not sure" and never guesses;
it cannot check live prices and says so."""
from core import contract
from core.errors import ApiError
from core.llm import get_llm
from skills import kit

TAG = "skill:world"


def answer(question: str | None, snapshot_base64: str | None = None, moment_id: str | None = None,
           source: str | None = None, save: bool = True) -> dict:
    image, src = kit.view(snapshot_base64, moment_id, source)
    q = (question or "").strip() or "What is this?"
    data = get_llm().skill("world", image, question=q) or {}
    spoken = (data.get("spoken") or "").strip() or "I couldn't make that out."
    text = (data.get("text") or spoken).strip()
    confidence = max(0.0, min(1.0, float(data.get("confidence") or 0)))
    unsure = confidence < 0.5
    if unsure and "not sure" not in spoken.lower():
        spoken = "I'm not sure. " + spoken
    moment = None
    if save:
        try:
            doc = kit.save_moment(transcript=q, caption=text, image=image if not src else None, tags=[TAG],
                                  source="phone" if snapshot_base64 else (src or {}).get("source", "dashboard"))
            moment = contract.moment(doc)
        except ApiError:
            moment = None  # capture is paused: still answer, store nothing
    elif src:
        moment = contract.moment(src)
    return kit.say(spoken, text, confidence=round(confidence, 2), unsure=unsure, saved=bool(save and moment), moment=moment)
