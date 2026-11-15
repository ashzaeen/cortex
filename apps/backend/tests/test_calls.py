"""D-10 call lifecycle: the call agent reports a call, the dashboard reads it. Shapes checked against the contract."""
from datetime import timedelta

from core import calls, events
from tests.contract_check import validate


def _types():
    return [e["type"] for e in events.history if e["type"].startswith("call.")]


def test_start_then_end_emits_events_and_current_follows(client):
    c = client
    assert validate(c.get("/calls/current"), "/calls/current", "get", 200) == {"call": None}
    started = validate(c.post("/calls/started", json={"call_id": "c1"}), "/calls/started", "post", 200)
    assert started["call_id"] == "c1" and started["ended_at"] is None
    assert validate(c.get("/calls/current"), "/calls/current", "get", 200)["call"]["call_id"] == "c1"
    ended = validate(c.post("/calls/ended", json={"call_id": "c1"}), "/calls/ended", "post", 200)
    assert ended["started_at"] == started["started_at"] and ended["ended_at"] is not None
    assert c.get("/calls/current").json() == {"call": None}
    assert _types() == ["call.started", "call.ended"]
    assert events.history[-1]["data"] == ended  # the event payload is the Call


def test_repeating_either_call_changes_nothing(client):
    c = client
    first = c.post("/calls/started", json={"call_id": "c1"}).json()
    assert c.post("/calls/started", json={"call_id": "c1"}).json() == first
    done = c.post("/calls/ended", json={"call_id": "c1"}).json()
    assert c.post("/calls/ended", json={"call_id": "c1"}).json() == done
    assert _types() == ["call.started", "call.ended"]


def test_a_new_call_ends_the_one_still_active(client):
    c = client
    c.post("/calls/started", json={"call_id": "c1"})
    c.post("/calls/started", json={"call_id": "c2"})
    assert _types() == ["call.started", "call.ended", "call.started"]
    assert events.history[-2]["data"]["call_id"] == "c1"
    assert c.get("/calls/current").json()["call"]["call_id"] == "c2"


def test_unknown_and_bad_requests_use_the_error_shape(client):
    c = client
    validate(c.post("/calls/ended", json={"call_id": "nope"}), "/calls/ended", "post", 404)
    validate(c.post("/calls/started", json={}), "/calls/started", "post", 400)
    validate(c.post("/calls/started", json={"call_id": ""}), "/calls/started", "post", 400)


def test_a_call_with_no_end_expires_so_the_dashboard_cannot_stick(client, monkeypatch):
    c = client
    t0 = calls.now()
    c.post("/calls/started", json={"call_id": "c1"})
    monkeypatch.setattr(calls, "now", lambda: t0 + timedelta(minutes=7))
    assert c.get("/calls/current").json() == {"call": None}
    assert _types() == ["call.started", "call.ended"]
    ended = events.history[-1]["data"]
    assert ended["ended_at"] is not None
    assert c.post("/calls/ended", json={"call_id": "c1"}).json() == ended  # the agent's late report is harmless
