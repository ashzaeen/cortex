"""Snapshots survive a redeploy: the database holds them, the local disk is only a cache."""
import base64
import shutil

from core.config import settings

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"


def _capture(client):
    r = client.post("/moments", json={"ts": "2026-11-15T10:00:00Z", "source": "glasses",
                                      "snapshot_base64": base64.b64encode(JPEG).decode()})
    assert r.status_code == 201
    return r.json()


def test_snapshot_survives_a_wiped_disk(client):
    m = _capture(client)
    path = m["snapshot_url"].replace("http://testserver", "")
    # A Railway redeploy starts a fresh container: the local snapshot folder is gone.
    shutil.rmtree(settings.snapshot_store, ignore_errors=True)
    r = client.get(path)
    assert r.status_code == 200 and r.content == JPEG
    assert r.headers["content-type"] == "image/jpeg"
    # The read warmed the cache again.
    assert (settings.snapshot_store / path.rsplit("/", 1)[1]).is_file()


def test_delete_removes_the_snapshot_everywhere(client):
    m = _capture(client)
    path = m["snapshot_url"].replace("http://testserver", "")
    assert client.delete(f"/moments/{m['id']}").status_code == 200
    assert client.get(path).status_code == 404
    shutil.rmtree(settings.snapshot_store, ignore_errors=True)
    assert client.get(path).status_code == 404  # not left behind in the database either


def test_bad_snapshot_names_are_rejected(client):
    for name in ["..%2F..%2Fmain.py", "snap_x.exe", "nothing.jpg.png"]:
        assert client.get(f"/snapshots/{name}").status_code == 404
