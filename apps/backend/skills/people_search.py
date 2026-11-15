"""NET-5 contact search: "Who did I meet who works on ML?" across cards, then across the moments behind them.

Reads people only (name, company, role, topics, notes), then falls back to memory search for moments that link
people. Never invents: with no match the answer says so. Whole-word matching, so "ML" does not hit "html"."""
import re

from core.errors import ApiError
from memory import search, store
from skills import network

FILLER = {"who", "did", "i", "meet", "met", "that", "works", "work", "working", "on", "at", "from", "the", "a", "an", "in",
          "with", "people", "person", "anyone", "someone", "do", "know", "about", "me", "my", "is", "are", "find"}
ASK_RE = re.compile(r"\bwho\b.*\b(met|meet|know|work)\w*|\bwhich (?:person|people)\b|\bfind (?:the )?(?:person|people)\b", re.I)


def wants(q: str) -> bool:
    return bool(ASK_RE.search(q or "")) and not re.search(r"\bpromis|owe|waiting\b", q or "", re.I)


def terms(q: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9+#.]+", (q or "").lower()) if w not in FILLER and len(w) > 1]


def search_people(q: str, limit: int = 10) -> list[dict]:
    ts = terms(q)
    if not ts:
        raise ApiError(400, "bad_request", "Say what to look for, like a company or a topic.")
    scored = {}
    for p in network.list_all():
        hay = " ".join(filter(None, [p["name"], p.get("company"), p.get("role"), p.get("notes"), *p.get("topics", [])])).lower()
        words = set(re.findall(r"[a-z0-9+#.]+", hay))
        hits = [t for t in ts if t in words]
        if hits:
            scored[p["id"]] = (len(hits), p, hits)
    if not scored:  # fall back to what was said around people
        for doc, _ in search.search(" ".join(ts), limit=6):
            for pid in doc.get("person_ids", []):
                p = next((x for x in network.list_all() if x["id"] == pid), None)
                if p and any(t in (doc.get("transcript") or "").lower() for t in ts):
                    scored.setdefault(pid, (0.5, p, ["mentioned"]))
    ranked = sorted(scored.values(), key=lambda s: -s[0])[:limit]
    return [{"person": p, "matched": hits} for _, p, hits in ranked]


def answer(q: str) -> tuple[str, list[dict]]:
    hits = search_people(q)
    if not hits:
        return "I don't have anyone on file who matches that.", []
    names = [f"{h['person']['name']}" + (f" from {h['person']['company']}" if h["person"].get("company") else "") for h in hits[:3]]
    moments = store.moments_by_ids([h["person"]["introduced_moment_id"] for h in hits[:3]])
    return ("You met " + ", ".join(names[:-1]) + (" and " if len(names) > 1 else "") + names[-1] + ".", moments)
