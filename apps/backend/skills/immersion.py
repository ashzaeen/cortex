"""SKL-6 Language immersion: name what you look at in the language you are learning, quiz yourself later.

Trigger: the Immersion tab, or "Name things in Spanish" on the glasses. Inputs: the view and a language.
Steps: name up to five visible objects, save each word with the moment it came from, quiz the least-known
first. Output: object and word pairs, then quiz questions. Confirmation: none. Undo: delete a word, or the
moment. Source moment: the one that showed the object. If unsure: nothing clearly visible means no words, and
the word is never invented. Quiz boxes: right moves a word up a box, wrong sends it back to box 1."""
import re
import unicodedata

from core import contract, db
from core.errors import ApiError, not_found
from core.ids import new_id
from core.llm import get_llm
from core.timeutil import now
from skills import kit

DEFAULTS = {"language": "spanish"}
TAG = "skill:immersion"


def settings(patch: dict | None = None) -> dict:
    if patch and "language" in patch:
        if not str(patch["language"] or "").strip():
            raise ApiError(400, "bad_request", "language cannot be empty.")
        patch = {"language": str(patch["language"]).strip().lower()}
    return kit.save_settings("immersion", DEFAULTS, patch) if patch else kit.get_settings("immersion", DEFAULTS)


def out(d: dict) -> dict:
    return {"id": d["_id"], "language": d["language"], "object": d["object"], "word": d["word"], "box": d["box"],
            "right": d.get("right", 0), "wrong": d.get("wrong", 0), "source_moment_id": d.get("source_moment_id"),
            "created_at": d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else d["created_at"]}


def name_objects(language: str | None, snapshot_base64: str | None = None, moment_id: str | None = None,
                 source: str | None = None) -> dict:
    lang = (language or settings()["language"]).strip().lower()
    image, src = kit.view(snapshot_base64, moment_id, source)
    items = (get_llm().skill("name_objects", image, language=lang) or {}).get("items") or []
    items = [i for i in items if (i.get("object") or "").strip() and (i.get("word") or "").strip()][:5]
    if not items:
        return kit.say("I can't see anything clear to name.", items=[], language=lang, moment=None)
    moment = None
    if src:
        moment = src
    else:
        try:
            moment = kit.save_moment(transcript=None, caption="Named in " + lang + ": " + ", ".join(i["object"] for i in items),
                                     image=image, tags=[TAG], source="phone")
        except ApiError:
            moment = None  # paused: still teach the words, they just have no source moment
    saved = []
    for i in items:
        obj, word = i["object"].strip().lower(), i["word"].strip()
        doc = db.col("vocab").find_one({"language": lang, "object": obj})
        if not doc:
            doc = {"_id": new_id("vcb"), "language": lang, "object": obj, "word": word, "box": 1, "right": 0, "wrong": 0,
                   "source_moment_id": moment["_id"] if moment else None, "created_at": now()}
            db.col("vocab").insert_one(doc)
        saved.append(out(doc))
    spoken = "That's " + ", ".join(f"{s['word']}, {s['object']}" for s in saved[:3]) + "."
    return kit.say(spoken, items=saved, language=lang, moment=contract.moment(moment) if moment else None)


def list_vocab(language: str | None = None) -> list[dict]:
    q = {"language": language.lower()} if language else {}
    return [out(d) for d in db.col("vocab").find(q).sort("created_at", -1)]


def delete(vocab_id: str) -> dict:
    d = db.col("vocab").find_one({"_id": vocab_id})
    if not d:
        raise not_found("word")
    db.col("vocab").delete_one({"_id": vocab_id})
    return {"deleted": True, "id": vocab_id}


def _plain(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"^(el|la|los|las|un|una|le|les|l'|der|die|das|ein|eine)\s+", "", s.strip())
    return re.sub(r"[^a-z0-9 ]+", "", s).strip()


def quiz(language: str | None = None) -> dict:
    q = {"language": language.lower()} if language else {}
    pool = list(db.col("vocab").find(q).sort([("box", 1), ("created_at", 1)]))
    if not pool:
        raise ApiError(409, "no_vocab", "Name a few things first, then I can quiz you.")
    d = pool[0]
    others = [p["word"] for p in pool[1:] if p["word"] != d["word"]][:2]
    choices = sorted({d["word"], *others}) if others else []
    return {"vocab_id": d["_id"], "language": d["language"], "object": d["object"], "box": d["box"],
            "prompt": f"How do you say “{d['object']}” in {d['language'].capitalize()}?", "choices": choices}


def answer(vocab_id: str, guess: str) -> dict:
    d = db.col("vocab").find_one({"_id": vocab_id})
    if not d:
        raise not_found("word")
    ok = bool(_plain(guess)) and _plain(guess) == _plain(d["word"])
    box = min(d["box"] + 1, 5) if ok else 1
    db.col("vocab").update_one({"_id": vocab_id}, {"$set": {"box": box}, "$inc": {"right" if ok else "wrong": 1}})
    spoken = "Correct." if ok else f"Not quite. It's {d['word']}."
    return kit.say(spoken, correct=ok, expected=d["word"], box=box)
