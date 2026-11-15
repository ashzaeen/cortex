"""POST /moments (D-1): one ingest pipeline for glasses, phone, call and dashboard.

ts/source/transcript/audio/snapshot in -> transcribe if needed -> Gemini perception (caption, intros,
promises) -> embedding -> MongoDB (+ Tiger Data timeline) -> link people by introduction (D-3) ->
proposed promises (D-4) -> events: moment.created, person.created, promise.proposed."""
import base64
import binascii
import logging
import time

from core import background, contract, db, events, receipts, snapshots, tiger, videos
from core.errors import ApiError
from core.ids import new_id
from core.llm import get_llm
from core.prompts import SPEAKER_RULE_DEFAULT, SPEAKER_RULE_WITH_PARTNER
from core.timeutil import human, now, parse_dt
from memory import store
from skills import brief, lists, modes, network, promises, suggest

log = logging.getLogger(__name__)


def _b64(value: str | None, field: str) -> bytes | None:
    if not value:
        return None
    if value.startswith("data:") and "," in value[:80]:
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(400, "bad_request", f"{field} is not valid base64.") from exc


_NO_SPEECH = {"", "null", "none", "n/a", "no speech", "silence", "(silence)", "[silence]", "nothing"}


def _heard(value) -> str | None:
    """The words the model heard in a video, or None when it reported no speech."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text[:2000] if text.lower().strip(".") not in _NO_SPEECH else None


def ingest(body: dict) -> dict:
    t0 = time.perf_counter()
    state = store.privacy()["state"]
    if state != "capturing":
        raise ApiError(409, state, f"Capture is {state.replace('_', '-')}; nothing was stored.")

    transcript = (body.get("transcript") or "").strip() or None
    audio = _b64(body.get("audio_base64"), "audio_base64")
    image = _b64(body.get("snapshot_base64"), "snapshot_base64")
    video = _b64(body.get("video_base64"), "video_base64")
    snapshot_url = body.get("snapshot_url")
    if not (transcript or audio or image or snapshot_url or video):
        raise ApiError(
            400,
            "bad_request",
            "Send at least one of transcript, audio_base64, snapshot_base64, snapshot_url, video_base64.",
        )

    llm = get_llm()
    if audio and not transcript:
        transcript = llm.transcribe(audio) or None
    if image:
        snapshot_url = snapshots.save(image)
    elif snapshot_url:
        image = snapshots.load_bytes(snapshot_url)
    video_url = None
    video_duration = None
    if video:
        video_duration = videos.validate(video)
        video_url = videos.save(video)

    ts = parse_dt(body.get("ts")) or now()
    if body.get("mode") and not modes.exists(body["mode"]):
        raise ApiError(400, "bad_request", f"Unknown mode {body['mode']}.")
    # MODE-2: "Switch to Student mode" switches before perception, so this moment is heard in the new mode.
    switched = modes.switch_command(transcript)
    if switched and switched != store.active_mode():
        modes.activate(switched)
    mode = body.get("mode") or switched or store.active_mode()
    moment_id = new_id("mom")

    partner = network.active_partner(ts)
    context, rule = "", SPEAKER_RULE_DEFAULT
    if partner:
        company = f" from {partner['company']}" if partner.get("company") else ""
        rule = SPEAKER_RULE_WITH_PARTNER.format(name=partner["name"], company=company)
        last = db.col("moments").find_one({"person_ids": partner["_id"]}, sort=[("ts", -1)])
        if last and last.get("transcript"):
            context = f'Just before this, the wearer was with {partner["name"]}{company}: "{last["transcript"]}"'

    p = llm.perceive(transcript=transcript or "", image=image, video=video, mode=mode, now_local=human(now()),
                     context=context, speaker_rule=rule, mode_rules=modes.perception_rules(mode)) or {}
    if video and not transcript:
        # Gemini hears a video's audio. Keep what was said, or search, proof and drafts never see it.
        transcript = _heard(p.get("transcript"))

    linked, created = network.from_introductions(p.get("people_introduced"), moment_id)
    created_ids = {x["_id"] for x in created}
    met_again = [x for x in linked if x["_id"] not in created_ids]
    if not linked and partner:
        linked = [partner]
    person_ids = [x["_id"] for x in linked]
    caption = (p.get("caption") or None) if image or video or body.get("snapshot_base64") else None
    embed_text = " ".join(filter(None, [transcript, caption, *[x["name"] for x in linked],
                                        *[x.get("company") or "" for x in linked]]))
    doc = {
        "_id": moment_id, "ts": ts, "source": body.get("source", "phone"), "mode": mode,
        "transcript": transcript, "caption": caption, "snapshot_url": snapshot_url, "place": None,
        "video_url": video_url, "video_duration_seconds": video_duration,
        "person_ids": person_ids, "off_record": False, "call_id": body.get("call_id"),
        "embedding": llm.embed(embed_text or "moment"), "created_at": now(),
    }
    tags = modes.tags_for(transcript)  # FOC-5 decision log
    if tags:
        doc["tags"] = tags
    lists.ensure_backfilled()  # before the insert, so the one-time scan never sees this moment
    store.insert_moment(doc)
    for x in linked:
        network.touch(x["_id"], ts, p.get("topics"))

    events.publish("moment.created", contract.moment(doc))
    network.announce(created)
    network.announce_met_again(met_again)
    focus = created[0] if created else (linked[0] if linked else None)
    new_promises = promises.from_perception(p.get("promises"), doc, focus)
    suggest.from_perception(p.get("suggestions"), store.get_moment(moment_id) or doc)
    lists.from_moment(doc)
    if not switched:
        modes.suggest_from(doc)  # MODE-2 auto-suggest: pending until the user says yes
    for pid in person_ids:
        background.run(brief.prewarm, pid)  # demo rule: the brief is warm before anyone asks

    if doc["source"] == "call":
        what = caption or transcript or "the caller's camera"
        receipts.create("capture", f"Saved from the call: {what[:120]}", [moment_id])

    latency = int((time.perf_counter() - t0) * 1000)
    tiger.log_metric(tiger.user(), now(), "moment", latency, len(image or b"") + len(video or b""))
    log.info("moment %s stored in %d ms (%d people, %d promises)", moment_id, latency, len(person_ids),
             len(new_promises))
    return contract.moment(store.get_moment(moment_id))
