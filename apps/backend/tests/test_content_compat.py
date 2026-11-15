"""content.run against an llm.py with and without thinking_budget (main briefly had the call without the parameter)."""
from core import content


def test_the_real_model_call_works_with_an_llm_that_has_no_thinking_budget(monkeypatch):
    """core/llm.py may or may not accept thinking_budget (it is added with the digest work): content.run must work with both."""
    import sys
    import types

    seen = {}

    class Old:
        vision_model = model = "m"

        def _json(self, prompt, parts=None, model=None, temperature=0.2):
            seen["old"] = True
            return {"ok": 1}

    class New(Old):
        def _json(self, prompt, parts=None, model=None, temperature=0.2, thinking_budget=None):
            seen["budget"] = thinking_budget
            return {"ok": 2}

    fake = types.ModuleType("google.genai")
    fake.types = types.SimpleNamespace(Part=types.SimpleNamespace(from_bytes=lambda **kw: kw))
    monkeypatch.setitem(sys.modules, "google.genai", fake)
    monkeypatch.setitem(sys.modules, "google", types.SimpleNamespace(genai=fake))
    kw = dict(day_label="today", now_local="n", facts="f", when="today", date="d", today="t")
    monkeypatch.setattr(content, "get_llm", lambda: Old())
    assert content.run("digest", **kw) == {"ok": 1} and seen == {"old": True}
    monkeypatch.setattr(content, "get_llm", lambda: New())
    assert content.run("digest", **kw) == {"ok": 2} and seen["budget"] == 0
