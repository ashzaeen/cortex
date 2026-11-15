"""The demo profile (apps/dashboard/demo) gives every feature something to show, so a new visitor never meets an empty
screen: routines, the caregiver (set up but never consented), list items, immersion words, a finished coach session,
decision-tagged moments, an overdue promise, an approved calendar event and a meeting with decisions to recap."""
from tests.contract_check import validate

H = {"x-cortex-user": "profile-check@demo.cortex"}


def get(c, path, template=None, **params):
    return validate(c.get(path, params=params, headers=H), template or path, "get", 200)


def test_a_new_visitor_has_something_in_every_feature(client):
    assert len(get(client, "/moments", limit=200)["items"]) >= 40
    routines = get(client, "/routines")["items"]
    assert {r["title"] for r in routines} >= {"Take the evening medicine", "Water the plants", "Call your sister"}
    cg = get(client, "/caregiver")
    assert cg["consent"] is False and cg["name"] and "Routine:" in cg["preview"]["body"]  # set up, never consented
    assert len(get(client, "/skills/immersion/vocab")["items"]) >= 8
    assert any(s["status"] == "done" for s in get(client, "/skills/coach")["items"])
    lists = {x["id"]: x for x in get(client, "/lists")["items"]}
    assert len(lists["shopping"]["items"]) >= 4 and lists["expenses"]["total"] == 18.4


def test_decisions_recap_nudges_and_auto_brief_have_material(client):
    decisions = get(client, "/moments", tag="decision", limit=50)["items"]
    assert len(decisions) >= 2
    recap = get(client, "/recap", kind="meeting")
    assert recap["moment_count"] >= 4 and len(recap["decisions"]) >= 2
    student = get(client, "/recap", mode="student", kind="lecture")
    assert student["moment_count"] >= 4
    promises = get(client, "/promises", status="confirmed")["items"]
    assert any(p["due"]["date"] and p["due"]["date"] < client.get("/digest", headers=H).json()["date"] for p in promises)
    actions = get(client, "/actions")["items"]
    assert any(a["type"] == "calendar_event" and a["status"] == "done" for a in actions)
    assert any(a["type"] == "notes" and a["status"] == "proposed" for a in actions)
    theo = get(client, "/people/per_theo/brief", "/people/{id}/brief")
    assert any("backup video" in i["text"] for i in theo["open"])
