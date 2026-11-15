"""GET /events: SSE framing, contract event types, and fan-out to subscribers."""
import asyncio

import pytest

from core import events
from tests.contract_check import registry  # noqa: F401  (ensures the contract loads)


def test_format_and_types():
    events.publish("moment.created", {"id": "mom_x"})
    msg = events.history[-1]
    assert msg["type"] == "moment.created" and msg["data"] == {"id": "mom_x"} and msg["at"]
    text = events.format_sse(msg)
    assert text.startswith("event: moment.created\ndata: {") and text.endswith("\n\n")
    with pytest.raises(ValueError):
        events.publish("not.a.type", {})


def test_subscribers_receive_events_from_threads():
    async def scenario():
        sub = events.subscribe()
        await asyncio.to_thread(events.publish, "receipt.created", {"id": "rcp_1"})
        msg = await asyncio.wait_for(sub[1].get(), timeout=2)
        events.unsubscribe(sub)
        return msg

    assert asyncio.run(scenario())["data"]["id"] == "rcp_1"


def test_app_implements_every_contract_operation(client):
    """The FastAPI app exposes exactly the paths and methods in contracts/openapi.yaml."""
    import yaml

    from core.config import REPO_ROOT

    spec = yaml.safe_load((REPO_ROOT / "contracts" / "openapi.yaml").read_text(encoding="utf-8"))
    want = {(path, m) for path, ops in spec["paths"].items() for m in ops if m in {"get", "post", "delete", "put", "patch"}}
    have = {(path, m) for path, ops in client.app.openapi()["paths"].items() for m in ops}
    assert want == have, f"missing: {sorted(want - have)}; extra: {sorted(have - want)}"


def test_api_key_guards_every_route_but_health(client):
    from core.config import settings

    settings.api_key = "k-test"
    try:
        assert client.get("/health").status_code == 200
        assert client.get("/people").status_code == 401
        assert client.get("/people", headers={"X-Cortex-Key": "wrong"}).status_code == 401
        assert client.get("/people", headers={"X-Cortex-Key": "k-test"}).status_code == 200
        assert client.get("/people", headers={"Authorization": "Bearer k-test"}).status_code == 200
        assert client.get("/people").json()["error"]["code"] == "unauthorized"
    finally:
        settings.api_key = ""
