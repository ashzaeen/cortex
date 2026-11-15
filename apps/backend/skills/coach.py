"""SKL-8 Cooking or repair coach: "Coach me through this" gives hands-free steps and flags mistakes.

Trigger: the Coach tab, or "Coach me through <job>" on the glasses. Inputs: the goal, then a frame and/or what the
wearer says at each step ("next", "repeat", "back"). Steps: plan 3 to 8 steps, speak one at a time, look at each
frame, move on when the step is done, stop and correct on a mistake. Output: the session, the current step and the
spoken line. Confirmation: none; it only speaks (jobs with power, gas, heat or blades start with a safety step).
Undo: end the session; the summary moment it saves at the end is deletable. Source moment: that summary.
If unsure: with no clear goal there are no steps and it asks what to coach, and it never says a step is done
without evidence from the frame or from the wearer."""
import re

from core import db, events
from core.errors import ApiError, not_found
from core.ids import new_id
from core.llm import get_llm
from core.timeutil import iso, now
from skills import kit

TAG = "skill:coach"
NEXT = re.compile(r"\b(next|done|finished|got it|ready|ok(?:ay)?)\b", re.I)
URGENT = re.compile(
    r"\b(burn(?:t|ed)?|hurt|bleed\w*|cut myself|on fire|fire|smoke|gas leak|shock(?:ed)?|electrocut\w*|ow)\b", re.I
)
SAFETY = "Stop. If anyone is hurt or in danger, call emergency services now. Say next when it is safe to continue."


def out(d: dict) -> dict:
    steps, i = d["steps"], d["index"]
    return {"id": d["_id"], "goal": d["goal"], "steps": steps, "step_index": i,
            "current_step": steps[i] if d["status"] == "active" and i < len(steps) else None,
            "status": d["status"], "mistakes": d["mistakes"], "moment_id": d.get("moment_id"),
            "created_at": iso(d["created_at"])}


def _get(session_id: str) -> dict:
    d = db.col("coach_sessions").find_one({"_id": session_id})
    if not d:
        raise not_found("coach session")
    return d


def _publish(d: dict, spoken: str, mistake: str | None = None) -> dict:
    result = kit.say(spoken, session=out(d), mistake=mistake)
    events.publish("coach.updated", {"session": out(d), "spoken": result["spoken"], "mistake": mistake})
    return result


def start(goal: str, snapshot_base64: str | None = None, moment_id: str | None = None, source: str | None = None) -> dict:
    goal = (goal or "").strip()
    image, _ = kit.view(snapshot_base64, moment_id, source, required=False)
    plan = get_llm().skill("coach_plan", image, goal=goal) or {}
    steps = [s.strip() for s in (plan.get("steps") or []) if str(s).strip()][:8]
    if not steps:
        raise ApiError(400, "bad_request", "I couldn't turn that into steps. Tell me what you want to do, like fixing a tap.")
    doc = {"_id": new_id("cch"), "goal": goal[:200], "steps": steps, "index": 0, "status": "active", "mistakes": 0,
           "created_at": now(), "updated_at": now()}
    db.col("coach_sessions").insert_one(doc)
    return _publish(doc, f"Step 1 of {len(steps)}. {steps[0]}")


def _finish(d: dict, status: str) -> dict:
    moment = None
    if status == "done":
        try:
            m = kit.save_moment(transcript=f"Coached through: {d['goal']}", caption=f"Finished {len(d['steps'])} steps, "
                                f"{d['mistakes']} correction(s).", image=None, tags=[TAG])
            moment = m["_id"]
        except ApiError:
            pass  # paused: still finish, store nothing
    db.col("coach_sessions").update_one({"_id": d["_id"]}, {"$set": {"status": status, "moment_id": moment, "updated_at": now()}})
    return _get(d["_id"])


def _advance(d: dict, i: int, steps: list[str], session_id: str) -> dict:
    if i + 1 >= len(steps):
        d = _finish(d, "done")
        return _publish(d, "That was the last step. You're done.")
    db.col("coach_sessions").update_one({"_id": session_id}, {"$set": {"index": i + 1, "updated_at": now()}})
    return _publish(_get(session_id), f"Step {i + 2} of {len(steps)}. {steps[i + 1]}")


def step(session_id: str, snapshot_base64: str | None = None, said: str | None = None, source: str | None = None) -> dict:
    d = _get(session_id)
    if d["status"] != "active":
        raise ApiError(409, "session_over", "That coaching session is over. Start a new one.")
    said = (said or "").strip()
    i, steps = d["index"], d["steps"]
    low = said.lower()
    if re.search(r"\b(repeat|again|say that again)\b", low):
        return _publish(d, f"Step {i + 1} of {len(steps)}. {steps[i]}")
    if re.search(r"\b(back|previous|go back)\b", low) and i > 0:
        db.col("coach_sessions").update_one({"_id": session_id}, {"$set": {"index": i - 1, "updated_at": now()}})
        d = _get(session_id)
        return _publish(d, f"Back to step {i} of {len(steps)}. {steps[i - 1]}")
    if URGENT.search(said):  # never leave this to the model: stop first
        db.col("coach_sessions").update_one({"_id": session_id}, {"$inc": {"mistakes": 1}, "$set": {"updated_at": now()}})
        return _publish(_get(session_id), SAFETY, SAFETY)
    image, _ = kit.view(snapshot_base64, None, source, required=False)
    if NEXT.search(said) and not image:  # no frame to contradict them: the wearer says they are done, so believe them
        return _advance(d, i, steps, session_id)
    verdict = get_llm().skill("coach_step", image, goal=d["goal"], steps="; ".join(steps), number=i + 1, current=steps[i],
                              said=said or "(nothing said)") or {}
    mistake = (verdict.get("mistake") or None)
    if mistake:
        db.col("coach_sessions").update_one({"_id": session_id}, {"$inc": {"mistakes": 1}, "$set": {"updated_at": now()}})
        return _publish(_get(session_id), (verdict.get("spoken") or mistake).strip(), mistake)
    if verdict.get("advance"):
        return _advance(d, i, steps, session_id)
    return _publish(d, (verdict.get("spoken") or "Take your time. Say next when you're done.").strip())


def end(session_id: str) -> dict:
    d = _get(session_id)
    if d["status"] == "active":
        d = _finish(d, "ended")
    return out(d)


def get(session_id: str) -> dict:
    return out(_get(session_id))


def list_recent(limit: int = 10) -> list[dict]:
    return [out(d) for d in db.col("coach_sessions").find().sort("created_at", -1).limit(limit)]
