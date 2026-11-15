"""Per-user memory: every signed-in user starts with their own copy of the demo profile, and what one user
adds, changes or deletes never reaches another user (or the default fixtures memory)."""
import asyncio

from core import events, user
from tests.contract_check import validate

A = {"X-Cortex-User": "ash.a@example.com"}
B = {"X-Cortex-User": "bo.b@example.com"}


def ids(c, path, headers=None, **params):
    return {x["id"] for x in validate(c.get(path, headers=headers or {}, params=params), path, "get", 200)["items"]}


def test_each_user_starts_with_the_demo_profile(client):
    a = ids(client, "/moments", A, limit=100)
    assert "mom_demo_01" in a and len(a) >= 30
    assert "mom_seed_001" not in a  # the fixtures stay with the default user
    assert ids(client, "/moments", B, limit=100) == a
    people = {p["name"] for p in validate(client.get("/people", headers=A), "/people", "get", 200)["items"]}
    assert {"Ash", "Jamie Ortiz", "Prof. Morgan Lee"} <= people


def test_what_one_user_adds_or_deletes_stays_theirs(client):
    before_b = ids(client, "/moments", B, limit=100)
    body = {"ts": "2026-11-15T14:02:11-06:00", "source": "phone", "transcript": "Only A should see this note."}
    mine = validate(client.post("/moments", json=body, headers=A), "/moments", "post", 201)
    assert mine["id"] in ids(client, "/moments", A, limit=100)
    assert mine["id"] not in ids(client, "/moments", B, limit=100)
    assert mine["id"] not in ids(client, "/moments", limit=100)

    validate(client.delete("/moments/mom_demo_01", headers=A), "/moments/{id}", "delete", 200)
    assert "mom_demo_01" not in ids(client, "/moments", A, limit=100)
    assert ids(client, "/moments", B, limit=100) == before_b  # B's copy is untouched

    client.post("/privacy/pause", json={"state": "paused"}, headers=A)
    assert client.get("/privacy", headers=A).json()["state"] == "paused"
    assert client.get("/privacy", headers=B).json()["state"] == "capturing"


def test_bad_or_missing_user_header_means_the_default_user(seeded):
    client = seeded
    assert user.normalize("not an email") == user.DEFAULT
    assert user.normalize(None) == user.DEFAULT
    assert "mom_seed_001" in ids(client, "/moments", {"X-Cortex-User": "x"}, limit=100)


def test_live_events_reach_only_their_user():
    async def run():
        token = user.set_current("ash.a@example.com")
        sub_a = events.subscribe()
        user._current.reset(token)
        token = user.set_current("bo.b@example.com")
        events.publish("privacy.changed", {"state": "paused", "since": None})
        user._current.reset(token)
        await asyncio.sleep(0)
        got = sub_a[1].qsize()
        events.unsubscribe(sub_a)
        return got

    assert asyncio.run(run()) == 0


def test_captures_without_a_user_are_shared_with_everyone(seeded):
    client = seeded
    body = {"ts": "2026-11-15T15:00:00-06:00", "source": "glasses", "transcript": "Shared note from the glasses."}
    shared = validate(client.post("/moments", json=body), "/moments", "post", 201)  # no X-Cortex-User
    a, b = ids(client, "/moments", A, limit=100), ids(client, "/moments", B, limit=100)
    assert shared["id"] in a and shared["id"] in b
    assert not any(i.startswith("mom_seed_") for i in a)  # the test fixtures stay hidden
    found = validate(client.get("/moments/search", headers=A, params={"q": "shared note glasses"}),
                     "/moments/search", "get", 200)["results"]
    assert found and found[0]["moment"]["id"] == shared["id"]
    mine = validate(client.post("/moments", json={**body, "transcript": "Private to A."}, headers=A),
                    "/moments", "post", 201)
    assert mine["id"] not in ids(client, "/moments", B, limit=100)
    assert mine["id"] not in ids(client, "/moments", limit=100)
