# apps/call-agent

The FaceTime call layer. A Chert line bridges an iPhone FaceTime call into a LiveKit room on **our own** LiveKit project. This agent joins the room, talks to the caller, reads the caller's camera, and calls the Cortex API. The agent is in [agent/](agent/README.md): Node with LiveKit Agents and Gemini Live (`gemini-2.5-flash-native-audio-preview-12-2025`); [ADR 0004](../../docs/decisions/0004-sponsor-stack.md) is still Proposed. Handoff: [docs/CHERT_CALL_LAYER_HANDOFF.md](../../docs/CHERT_CALL_LAYER_HANDOFF.md).

**State (T0-10):** step 1 and the caller's camera to Gemini work on real calls. Steps 2 and 3 and the call lifecycle are written and tested offline against the real backend (`agent/cortex.mjs`), but **not yet run on a real FaceTime call**. The call lifecycle endpoints are in the contract, the backend and the stateful mock, and the dashboard's "On Call" state follows them (browser test against the mock). They are live on the hosted backend (redeployed 2026-11-15). On a hosted agent, set `CORTEX_API_URL` to the hosted backend: the default points at the local mock.

## What it must do (T0-10)

1. Greet within 10 seconds of the bridge being ready, or Chert ends the call.
2. Answer from memory: `POST /ask` with `channel: "call"`, and `GET /people/{id}/brief`. Built as the Gemini tools `ask_memory` and `brief_person`.
3. Save what the caller's camera shows: `POST /moments` with `source: "call"` and `call_id`. Built as the tool `save_what_you_see`, which saves the newest camera frame **only when the caller asks** (a person may be in the picture; whether to also save automatically is open question 4 in the handoff). Nothing is sent while capture is paused or off the record (the backend answers 409 and the agent tells the caller).
4. Tell the dashboard about the call: `POST /calls/started` when the caller joins and `POST /calls/ended` on shutdown, so the Live pill shows "On Call" and the Call Cortex sheet runs its 5:00 timer. Best effort: it never blocks or ends a call.
5. Video back to the caller is **Tier 1** (fallback: an iMessage attachment).

## Chert limits

Calls cap at 5 minutes. A line serves one call at a time. The agent process and the Chert connector must both keep running, so a laptop hosts the demo. Outbound calls only reach phones verified by an iMessage code. The trial is 50 FaceTime minutes. **Do not start the trial early**: see the M0 spike on how the track's free 48-hour line is issued.

## Setup outline (check Chert's docs first)

Chert's skill file is at https://app.trychert.com/skills.md and its docs are at https://docs.trychert.com. Read the video guide (`chert guide video`) to confirm how caller camera frames arrive. Keys go in `.env` (`CHERT_API_KEY`, `CHERT_PROJECT_ID`, `LIVEKIT_*`, `AGENT_NAME`), never in chat or the repo.

## Connect it to Cortex

Set `CORTEX_API_URL` in `agent/.env.local` (default `http://127.0.0.1:4010`, the stateful mock from `make dev`). The hosted backend is in [STATUS.md](../../docs/STATUS.md); its database is the demo data, so point real test calls at it only on purpose (saved moments and "On Call" events show on the live dashboard).

## Test it

`make test` runs the client and tool tests against a fake Cortex API (no install needed); `make lint` syntax-checks the agent. Both run inside `make check`.

## Run it alone

Run the Cortex side against the mock API (`make mock`). The call side needs a real Chert line and LiveKit project, so label an issue `needs-human` when it needs a phone or a key.
