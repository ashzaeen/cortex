# apps/call-agent

The FaceTime call layer. A Chert line bridges an iPhone FaceTime call into a LiveKit room on **our own** LiveKit project. This agent joins the room, talks to the caller, reads the caller's camera, and calls the Cortex API. The agent is in [agent/](agent/README.md): Node with LiveKit Agents and Gemini Live (`gemini-2.5-flash-native-audio-preview-12-2025`); [ADR 0004](../../docs/decisions/0004-sponsor-stack.md) is still Proposed. Handoff: [docs/CHERT_CALL_LAYER_HANDOFF.md](../../docs/CHERT_CALL_LAYER_HANDOFF.md).

**State (D-10):** step 1 and the caller's camera to Gemini work on real calls. Steps 2 and 3 are not built: the agent answers from its own prompt and saves nothing to Cortex.

## What it must do (D-10)

1. Greet within 10 seconds of the bridge being ready, or Chert ends the call.
2. Answer from memory: `POST /ask` with `channel: "call"`, and `GET /people/{id}/brief`.
3. Save what the caller's camera shows: sample a frame and send `POST /moments` with `source: "call"` and `call_id`.
4. Video back to the caller (CALL-4; fallback: an iMessage attachment).

## Chert limits

Calls cap at 5 minutes. A line serves one call at a time. The agent process and the Chert connector must both keep running, so a laptop hosts the demo. Outbound calls only reach phones verified by an iMessage code. The trial is 50 FaceTime minutes. **Do not start the trial early**: see the M0 spike on how the track's free 48-hour line is issued.

## Setup outline (check Chert's docs first)

Chert's skill file is at https://app.trychert.com/skills.md and its docs are at https://docs.trychert.com. Read the video guide (`chert guide video`) to confirm how caller camera frames arrive. Keys go in `.env` (`CHERT_API_KEY`, `CHERT_PROJECT_ID`, `LIVEKIT_*`, `AGENT_NAME`), never in chat or the repo.

## Run it alone

Run the Cortex side against the mock API (`make mock`). The call side needs a real Chert line and LiveKit project, so label an issue `needs-human` when it needs a phone or a key.
