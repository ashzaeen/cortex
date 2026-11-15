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
    assert len(lists["shopping"]["items"]) >= 4 and lists["expenses"]["total"] == 89.3


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
    assert any("backup video" in x["what"].lower() for x in theo["open_promises"])


def test_a_user_seeded_from_older_demo_data_is_seeded_again(client):
    """Users who first visited before the demo data grew (the approved logins too) get the new data on their next visit."""
    from core import db, user
    from scripts.seed import profile_version

    assert len(get(client, "/actions")["items"]) >= 30
    token = user._current.set("profile-check@demo.cortex")
    try:
        db.col("actions").delete_many({})
        db.col("state").update_one({"_id": "profile"}, {"$set": {"version": "old"}})
    finally:
        user._current.reset(token)
    user.forget_ready()
    assert len(get(client, "/actions")["items"]) >= 30
    token = user._current.set("profile-check@demo.cortex")
    try:
        assert db.col("state").find_one({"_id": "profile"})["version"] == profile_version()
    finally:
        user._current.reset(token)


def test_a_public_visitor_never_sees_the_owners_real_memory(client):
    """Signed-in users see the shared memory (core/merged.py); a /demo visitor (@demo.cortex) must not."""
    from core import db, user
    from core.timeutil import now

    db.col("moments").insert_one({"_id": "mom_owner_private", "ts": now(), "source": "glasses", "mode": "focus",
                                  "transcript": "owner only", "caption": None, "snapshot_url": None, "place": None,
                                  "person_ids": [], "off_record": False, "created_at": now()})
    ids = {m["id"] for m in get(client, "/moments", limit=200)["items"]}
    assert "mom_owner_private" not in ids and "mom_demo_41" in ids
    token = user._current.set("someone@gmail.com")
    try:
        assert db.col("moments").find_one({"_id": "mom_owner_private"})  # a real signed-in user still sees it
    finally:
        user._current.reset(token)
