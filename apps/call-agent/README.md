# apps/call-agent

The FaceTime call layer. A Chert line bridges an iPhone FaceTime call into a LiveKit room on **our own** LiveKit project. This agent joins the room, talks to the caller, reads the caller's camera, and calls the Cortex API. Stub only; the language is TBD ([ADR 0004](../../docs/decisions/0004-sponsor-stack.md)).

## What it must do (T0-10)

1. Greet within 10 seconds of the bridge being ready, or Chert ends the call.
2. Answer from memory: `POST /ask` with `channel: "call"`, and `GET /people/{id}/brief`.
3. Save what the caller's camera shows: sample a frame and send `POST /moments` with `source: "call"` and `call_id`.
4. Video back to the caller is **Tier 1** (fallback: an iMessage attachment).

## Chert limits

Calls cap at 5 minutes. A line serves one call at a time. The agent process and the Chert connector must both keep running, so a laptop hosts the demo. Outbound calls only reach phones verified by an iMessage code. The trial is 50 FaceTime minutes. **Do not start the trial early**: see the M0 spike on how the track's free 48-hour line is issued.

## Setup outline (check Chert's docs first)

Chert's skill file is at https://app.trychert.com/skills.md and its docs are at https://docs.trychert.com. Read the video guide (`chert guide video`) to confirm how caller camera frames arrive. Keys go in `.env` (`CHERT_API_KEY`, `CHERT_PROJECT_ID`, `LIVEKIT_*`, `AGENT_NAME`), never in chat or the repo.

## Run it alone

Run the Cortex side against the mock API (`make mock`). The call side needs a real Chert line and LiveKit project, so label an issue `needs-human` when it needs a phone or a key.
