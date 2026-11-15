"""Videos survive a redeploy: MongoDB holds them in 4 MB chunks, the local disk is only a cache."""
import base64
import shutil

from core import db, videos
from core.config import settings
from tests.test_done_when import mov


def _capture(client, clip: bytes) -> dict:
    r = client.post("/moments", json={"ts": "2026-11-15T10:00:00Z", "source": "glasses",
                                      "video_base64": base64.b64encode(clip).decode()})
    assert r.status_code == 201
    return r.json()


def test_video_survives_a_wiped_disk_and_spans_chunks(client):
    # Pad past one chunk so reassembly across chunks is exercised (the mvhd box stays readable).
    clip = mov(5) + b"\x00" * (videos.CHUNK + 1234)
    m = _capture(client, clip)
    name = m["video_url"].rsplit("/", 1)[1]
    assert db.col("videos").find_one({"_id": name})["chunks"] == 2
    shutil.rmtree(settings.video_store, ignore_errors=True)  # a fresh Railway container
    r = client.get(f"/videos/{name}")
    assert r.status_code == 200 and r.content == clip
    assert r.headers["content-type"] == "video/quicktime"
    # Safari plays video through byte ranges.
    part = client.get(f"/videos/{name}", headers={"Range": "bytes=0-99"})
    assert part.status_code == 206 and part.content == clip[:100]


def test_delete_removes_the_video_everywhere(client):
    m = _capture(client, mov(3))
    name = m["video_url"].rsplit("/", 1)[1]
    assert client.delete(f"/moments/{m['id']}").status_code == 200
    assert db.col("videos").find_one({"_id": name}) is None
    assert db.col("video_chunks").count_documents({"video": name}) == 0
    shutil.rmtree(settings.video_store, ignore_errors=True)
    assert client.get(f"/videos/{name}").status_code == 404


def test_bad_video_names_are_rejected(client):
    for name in ["..%2F..%2Fmain.py", "video_x.exe", "x.mov.mp4"]:
        assert client.get(f"/videos/{name}").status_code == 404
