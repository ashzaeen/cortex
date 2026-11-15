"""Rule-based stand-in for Gemini: no key, no network. Used by tests and for offline rehearsal.
Embeddings are hashed bags of words, so related text still scores higher."""
import hashlib
import math
import re
from datetime import timedelta

from core.config import settings
from core.timeutil import now, tz

STOP = set("the a an and or to of in on at is are was were i you it this that my me for with be will did "
           "do what where when who how by from your our we us".split())
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def words(text: str) -> list[str]:
    out = []
    for w in re.findall(r"[a-z0-9']+", (text or "").lower()):
        w = w.strip("'")
        if w.endswith("'s"):
            w = w[:-2]
        if len(w) > 3 and w.endswith("s"):
            w = w[:-1]
        if w and w not in STOP:
            out.append(w)
    return out


def next_weekday(day: str) -> str:
    local = now().astimezone(tz())
    delta = (DAYS.index(day) - local.weekday()) % 7 or 7
    return (local + timedelta(days=delta)).date().isoformat()


class MockLLM:
    is_mock = True

    def embed(self, text: str, task: str = "RETRIEVAL_DOCUMENT") -> list[float]:
        vec = [0.0] * settings.embed_dim
        for w in words(text):
            vec[int(hashlib.md5(w.encode()).hexdigest(), 16) % settings.embed_dim] += 1.0
        n = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / n for v in vec]

    def transcribe(self, audio: bytes) -> str:
        return ""

    def perceive(self, *, transcript: str, image, video, mode: str, now_local: str, context: str,
                 speaker_rule: str) -> dict:
        t = transcript or ""
        people, promises = [], []
        m = re.search(r"\b(?i:this is|i'm|i am|my name is|meet)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)"
                      r"(?:,?\s+from\s+([A-Z][\w&]+))?", t)
        if m:
            people.append({"name": m.group(1), "company": m.group(2), "role": None, "confidence": 0.95})

        low = t.lower()
        day = next((d for d in DAYS if re.search(rf"\b{d}\b", low)), None)
        partner = re.search(r"talking with ([A-Z][\w ]+?)(?: \(| from|\.|,| A first)", speaker_rule or "")
        m = re.search(r"\bi(?:'ll| will)\s+(send|share|email|get|give|bring|call|intro\w*)\s+(?:you\s+)?"
                      r"([^.?!,]+?)(?:\s+(?:by|on|this|next)?\s*(?:monday|tuesday|wednesday|thursday|friday|"
                      r"saturday|sunday|tomorrow))?\s*[.?!]?$", low.strip())
        if m:
            what = f"{m.group(1).capitalize()} {m.group(2).strip()}"
            promises.append({
                "direction": "waiting_on" if partner else "i_owe",
                "person_name": partner.group(1).strip() if partner else (people[0]["name"] if people else None),
                "what": what, "due_text": day.capitalize() if day else None,
                "due_date": next_weekday(day) if day else None, "due_inferred": False, "confidence": 0.9,
            })
        m = re.search(r"\bi owe ([A-Z][a-z]+) (.+?)(?: by (\w+))?[.?!]?$", t)
        if m:
            d = (m.group(3) or "").lower()
            promises.append({"direction": "i_owe", "person_name": m.group(1), "what": m.group(2),
                             "due_text": m.group(3), "due_date": next_weekday(d) if d in DAYS else None,
                             "due_inferred": False, "confidence": 0.9})
        topics = [w for w in words(t) if len(w) > 4][:3]
        caption = "A short video from the wearer's point of view." if video else (
            "A scene from the wearer's point of view." if image else None)
        return {"caption": caption, "topics": topics,
                "people_introduced": people, "promises": promises, "suggestions": self._suggest(t)}

    @staticmethod
    def _suggest(t: str) -> list[dict]:
        """Fake rules: "remind me to X [by Friday]" and "<event> on <day> at <h>[:mm] am|pm"."""
        out, low = [], t.lower()
        m = re.search(r"\bremind me to ([^.?!]+?)(?:\s+by\s+(\w+))?[.?!]?$", low.strip())
        if m:
            d = (m.group(2) or "").lower()
            out.append({"type": "reminder", "title": m.group(1).strip().capitalize(),
                        "due_date": next_weekday(d) if d in DAYS else None, "confidence": 0.9})
        m = re.search(r"\b([\w ]*?(?:meeting|demo|quiz|exam|class|interview))\s+(?:is\s+)?(?:on\s+)?"
                      r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d\d))?\s*(am|pm)", low)
        if m:
            hour = int(m.group(3)) % 12 + (12 if m.group(5) == "pm" else 0)
            start = f"{next_weekday(m.group(2))}T{hour:02d}:{m.group(4) or '00'}"
            out.append({"type": "calendar_event", "title": m.group(1).strip().removeprefix("the ").capitalize(), "start": start,
                        "end": None, "location": None, "confidence": 0.9})
        return out

    def answer(self, *, question: str, moments: str, promises: str, **_) -> dict:
        rows = re.findall(r"^\[(mom_[\w-]+)\]\s*(.*)$", moments or "", flags=re.MULTILINE)
        q = set(words(question))
        scored = sorted(rows, key=lambda r: len(q & set(words(r[1]))), reverse=True)
        if not scored or not (q & set(words(scored[0][1]))):
            return {"answer": "I don't have that in memory.", "spoken": "I don't have that in memory.",
                    "citations": [], "grounded": False}
        text = scored[0][1].split("heard: ", 1)[-1].split(" | ")[0].strip(' "')
        return {"answer": f"From memory: {text}", "spoken": text[:140], "citations": [scored[0][0]], "grounded": True}

    def brief(self, *, name: str, company: str, promises: str, moments: str, **_) -> dict:
        open_items = [ln.strip("- ").split(" [")[0] for ln in (promises or "").splitlines() if ln.strip()]
        n = len([ln for ln in (moments or "").splitlines() if ln.startswith("[")])
        spoken = f"{name}{company}. You have {n} moment{'s' if n != 1 else ''} together."
        if open_items:
            spoken += f" Open: {open_items[0]}."
        return {"spoken": spoken, "bullets": [f"{name}{company}", f"{n} moment(s) on file",
                                              open_items[0] if open_items else "Nothing open"]}

    def follow_up(self, *, name: str, company: str, promises: str, **_) -> dict:
        first = (promises or "").splitlines()[0].strip("- ").split(" [")[0] if promises else ""
        body = f"Hi {name.split()[0]},\n\nGreat meeting you today. " + (f"Looking forward to it: {first}. " if first else "") \
            + "Talk soon."
        return {"subject": "Great meeting you at HackUTA", "body": body}
