"""Every read endpoint returns the contract shape on the seeded fixtures; errors use the Error shape."""
from tests.contract_check import validate


def test_health(client):
    assert validate(client.get("/health"), "/health", "get", 200)["ok"] is True


def test_reads_match_contract_on_seeded_data(seeded):
    c = seeded
    moments = validate(c.get("/moments"), "/moments", "get", 200)["items"]
    assert [m["id"] for m in moments][:1] == ["mom_seed_007"]  # newest first
    assert len(validate(c.get("/moments?limit=2"), "/moments", "get", 200)["items"]) == 2
    since = validate(c.get("/moments", params={"since": "2026-11-13T00:00:00-06:00"}), "/moments", "get", 200)
    assert {m["id"] for m in since["items"]} == {"mom_seed_006", "mom_seed_007"}
    validate(c.get("/moments/search?q=keys"), "/moments/search", "get", 200)
    validate(c.get("/people"), "/people", "get", 200)
    validate(c.get("/people/per_sam/brief"), "/people/{id}/brief", "get", 200)
    validate(c.get("/promises"), "/promises", "get", 200)
    assert len(validate(c.get("/promises?direction=i_owe"), "/promises", "get", 200)["items"]) == 1
    validate(c.get("/receipts"), "/receipts", "get", 200)
    validate(c.get("/privacy"), "/privacy", "get", 200)
    modes = validate(c.get("/modes"), "/modes", "get", 200)["items"]
    assert [m["id"] for m in modes if m["active"]] == ["focus"]


def test_errors_use_contract_shape(seeded):
    c = seeded
    validate(c.get("/people/per_nobody/brief"), "/people/{id}/brief", "get", 404)
    validate(c.delete("/moments/mom_nope"), "/moments/{id}", "delete", 404)
    validate(c.post("/promises/prm_nope/confirm"), "/promises/{id}/confirm", "post", 404)
    validate(c.post("/moments", json={"source": "glasses"}), "/moments", "post", 400)
    validate(c.post("/moments", json={"ts": "2026-11-15T14:00:00-06:00", "source": "glasses"}), "/moments", "post", 400)
    validate(c.post("/actions/act_nope/undo"), "/actions/{id}/undo", "post", 404)
    r = c.post("/ask", json={"question": "", "channel": "voice"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"
