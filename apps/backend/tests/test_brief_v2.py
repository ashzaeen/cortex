"""Brief v2 (#54): a headline, open commitments (overdue first), the last conversation with a real quote, a suggested
opener, and a spoken line that leads with what matters. Offline (the template path) and with a stand-in model answer,
including the checks that throw away anything the model made up."""
from datetime import timedelta

from core import content, db
from core.timeutil import now, tz
from skills import brief
from tests.contract_check import validate


def get_brief(c, pid):
    return validate(c.get(f"/people/{pid}/brief"), "/people/{id}/brief", "get", 200)


def set_due(pid_promise: str, days_ago: int):
    day = (now().astimezone(tz()).date() - timedelta(days=days_ago)).isoformat()
    db.col("promises").update_one({"_id": pid_promise}, {"$set": {"due": {"date": day, "inferred": False, "text": "x"}}})


def test_template_brief_has_every_part_and_leads_with_the_overdue_item(seeded, client):
    people = client.get("/people").json()["items"]
    ash = next(p for p in people if p["name"] == "Sam Rivera")
    b = get_brief(client, ash["id"])
    assert b["headline"] and b["spoken"].startswith("Sam") and len(b["bullets"]) == 3
    assert b["last_time"] and b["last_time"]["moment_id"].startswith("mom_")
    assert [i["promise_id"] for i in b["open"]] == [p["id"] for p in b["open_promises"]]
    assert all(set(i) >= {"text", "direction", "overdue", "days_overdue"} for i in b["open"])
    pid = b["open"][0]["promise_id"]
    set_due(pid, 3)
    brief.clear_cache()
    late = get_brief(client, ash["id"])["open"][0]
    assert late["overdue"] and late["days_overdue"] == 3
    spoken = get_brief(client, ash["id"])["spoken"]
    assert "3 days overdue" in spoken  # the most urgent thing comes first, with how late


def test_open_items_put_overdue_first_then_by_due_date(seeded, client):
    ash = next(p for p in client.get("/people").json()["items"] if p["name"] == "Sam Rivera")
    person = db.col("people").find_one({"_id": ash["id"]})
    base = {"direction": "waiting_on", "person_id": ash["id"], "status": "confirmed", "source_moment_id": "mom_seed_001"}
    items = brief.open_items([
        {**base, "_id": "prm_a", "what": "Send the deck", "due": {"date": "2999-01-01", "text": None}},
        {**base, "_id": "prm_b", "what": "Send the quote", "due": {"date": "2000-01-01", "text": None}},
        {**base, "_id": "prm_c", "what": "Send notes", "due": {"date": None, "text": "sometime"}},
    ], person)
    assert [i["promise_id"] for i in items] == ["prm_b", "prm_a", "prm_c"]
    assert items[0]["overdue"] and not items[2]["overdue"]  # a vague date is never overdue


def test_model_parts_are_checked_and_made_up_ones_dropped(seeded, client, monkeypatch):
    ash = next(p for p in client.get("/people").json()["items"] if p["name"] == "Sam Rivera")
    moment = db.col("moments").find_one({"_id": ash["introduced_moment_id"]})
    real = (moment.get("transcript") or "").strip()

    def fake(task, image=None, **kw):
        return {"headline": "Sam, Globex: the link is due", "spoken": "Sam owes you the link.", "bullets": ["a", "b", "c"],
                "opener": "Any news on the link?",
                "last_time": {"when": "Wednesday", "gist": "You met.", "quote": "words nobody ever said", "moment_id": moment["_id"]}}

    monkeypatch.setattr(content, "run", fake)
    brief.clear_cache()
    b = get_brief(client, ash["id"])
    assert b["headline"] == "Sam, Globex: the link is due" and b["opener"] == "Any news on the link?"
    assert b["last_time"]["quote"] is None  # not a substring of the moment: dropped
    if real:
        quote = real[:40]
        monkeypatch.setattr(content, "run", lambda task, image=None, **kw: {
            **fake(task), "last_time": {"when": "W", "gist": "g", "quote": quote, "moment_id": moment["_id"]}})
        brief.clear_cache()
        assert get_brief(client, ash["id"])["last_time"]["quote"] == quote


def test_an_unusable_model_answer_falls_back_to_the_template(seeded, client, monkeypatch):
    ash = next(p for p in client.get("/people").json()["items"] if p["name"] == "Sam Rivera")
    monkeypatch.setattr(content, "run", lambda task, image=None, **kw: {"spoken": "Nobody in particular.", "bullets": []})
    brief.clear_cache()
    b = get_brief(client, ash["id"])
    assert b["spoken"].startswith("Sam") and len(b["bullets"]) == 3 and b["headline"]
