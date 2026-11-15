"""Offline stand-ins for the SKL-4..8 model tasks: small, deterministic, honest about what they cannot do.
Test hooks: image bytes containing b"confusing" make the scene confusing; b"plant" or b"cup" steer the object names."""
import hashlib
import re

PHRASES = {
    "spanish": {"hello": "hola", "thank you": "gracias", "good morning": "buenos días", "where is the bathroom": "¿dónde está el baño?",
                "how much is this": "¿cuánto cuesta esto?", "i need help": "necesito ayuda"},
    "french": {"hello": "bonjour", "thank you": "merci", "good morning": "bonjour", "where is the bathroom": "où sont les toilettes ?",
               "how much is this": "combien ça coûte ?", "i need help": "j'ai besoin d'aide"},
    "german": {"hello": "hallo", "thank you": "danke", "good morning": "guten Morgen", "where is the bathroom": "wo ist die Toilette?",
               "how much is this": "wie viel kostet das?", "i need help": "ich brauche Hilfe"},
}
REVERSE = {lang: {v: k for k, v in table.items()} for lang, table in PHRASES.items()}
OBJECTS = {
    "spanish": {"cup": "la taza", "table": "la mesa", "window": "la ventana", "plant": "la planta", "book": "el libro"},
    "french": {"cup": "la tasse", "table": "la table", "window": "la fenêtre", "plant": "la plante", "book": "le livre"},
    "german": {"cup": "die Tasse", "table": "der Tisch", "window": "das Fenster", "plant": "die Pflanze", "book": "das Buch"},
}


def _bytes(image) -> bytes:
    return image if isinstance(image, (bytes, bytearray)) else b""


def run(task: str, image, **kw) -> dict:
    return globals()[f"_{task}"](image, **kw)


def _world(image, question: str = "", **_) -> dict:
    q = (question or "").lower()
    raw = _bytes(image)
    if not image and not q:
        return {"spoken": "I need a view or a question to answer that.", "text": "I need a view or a question.", "confidence": 0.0}
    if "price" in q:
        msg = "I can't check live prices, so I can't say if this is a good deal."
        return {"spoken": msg, "text": msg, "confidence": 0.6}
    if b"plant" in raw or "plant" in q:
        return {"spoken": "That looks like a leafy houseplant. Check the leaves before you water it.",
                "text": "A leafy houseplant. I can't be sure of the species from here.", "confidence": 0.7}
    if image:
        msg = "I can see it, but I can't tell what it is with confidence."
        return {"spoken": msg, "text": msg, "confidence": 0.3}
    return {"spoken": "I can't tell without seeing it.", "text": "I can't tell without seeing it.", "confidence": 0.2}


def _translate(_image, text: str = "", target: str = "spanish", source: str = "auto", **_) -> dict:
    t = re.sub(r"[^a-z' ]+", "", (text or "").lower()).strip()
    lang, src = (target or "").lower(), (source or "auto").lower()
    if lang in PHRASES and t in PHRASES[lang]:
        return {"translation": PHRASES[lang][t], "source_language": "English", "confidence": 0.9}
    for other, rev in REVERSE.items():  # a foreign phrase heard, translated into the other language (English)
        key = re.sub(r"[^\w' ]+", "", (text or "").lower()).strip()
        for foreign, english in rev.items():
            if re.sub(r"[^\w' ]+", "", foreign.lower()) == key and lang in ("english", "en"):
                return {"translation": english.capitalize(), "source_language": other.capitalize(), "confidence": 0.9}
    return {"translation": "", "source_language": src.capitalize() if src != "auto" else "Unknown", "confidence": 0.0}


def _name_objects(image, language: str = "spanish", **_) -> dict:
    table = OBJECTS.get((language or "").lower())
    if not image or not table:
        return {"items": []}
    raw = _bytes(image)
    names = [n for n in table if n.encode() in raw] or ["cup", "table", "window"]
    return {"items": [{"object": n, "word": table[n]} for n in names[:5]]}


def _scene(image, **_) -> dict:
    if not image:
        return {"scene": "", "confusing": False, "offer": ""}
    raw = _bytes(image)
    label = "an error message" if b"confusing" in raw else "scene " + hashlib.md5(raw[:64]).hexdigest()[:6]
    return {"scene": label, "confusing": b"confusing" in raw,
            "offer": "Want me to explain this?" if b"confusing" in raw else ""}


def _coach_plan(_image, goal: str = "", **_) -> dict:
    g = (goal or "").strip().rstrip(".")
    if len(g) < 4:
        return {"steps": [], "spoken": "What would you like help with?"}
    steps = [f"Get everything you need for: {g}", "Clear a workspace and check nothing is plugged in or hot",
             f"Do the main part of: {g}", "Check the result against what you expected"]
    return {"steps": steps, "spoken": f"Step 1. {steps[0]}."}


def _coach_step(image, goal: str = "", steps=None, number: int = 1, said: str = "", **_) -> dict:
    s, raw = (said or "").lower(), _bytes(image)
    if re.search(r"\b(wrong|oops|mistake|broke|spilled)\b", s) or b"wrong" in raw:
        return {"advance": False, "mistake": "That doesn't look right. Stop, undo that step and try again slowly.",
                "spoken": "Stop. Undo that and try the step again, slowly."}
    if re.search(r"\b(done|next|finished|ok|okay)\b", s):
        return {"advance": True, "mistake": None, "spoken": "Good. On to the next step."}
    return {"advance": False, "mistake": None, "spoken": "Take your time. Say next when you're done with this step."}
