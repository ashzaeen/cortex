# apps/call-agent

The FaceTime call layer. A Chert line bridges an iPhone FaceTime call into a LiveKit room on **our own** LiveKit project. This agent joins the room, talks to the caller, reads the caller's camera, and calls the Cortex API. The agent is in [agent/](agent/README.md): Node with LiveKit Agents and Gemini Live (`gemini-2.5-flash-native-audio-preview-12-2025`); [ADR 0004](../../docs/decisions/0004-sponsor-stack.md) is still Proposed. Handoff: [docs/CHERT_CALL_LAYER_HANDOFF.md](../../docs/CHERT_CALL_LAYER_HANDOFF.md).

**State (D-10):** step 1 and the caller's camera to Gemini work on real calls. Steps 2 and 3 and the call lifecycle are written and tested offline against the real backend (`agent/cortex.mjs`), but **not yet run on a real FaceTime call**. The call lifecycle endpoints are in the contract, the backend and the stateful mock, and the dashboard's "On Call" state follows them (browser test against the mock). They are live on the hosted backend (redeployed 2026-11-15). On a hosted agent, set `CORTEX_API_URL` to the hosted backend: the default points at the local mock.

## What it must do (D-10)

1. Greet within 10 seconds of the bridge being ready, or Chert ends the call.
2. Answer from memory: `POST /ask` with `channel: "call"`, and `GET /people/{id}/brief`. Built as the Gemini tools `ask_memory` and `brief_person`.
3. Save what the caller's camera shows: `POST /moments` with `source: "call"` and `call_id`. Built as the tool `save_what_you_see`, which saves the newest camera frame **only when the caller asks** (a person may be in the picture; decided on request, not automatic, by @ashzaeen on 2026-11-15). In the demo the presenter says "save this" while holding the card up. Nothing is sent while capture is paused or off the record (the backend answers 409 and the agent tells the caller).
4. Tell the dashboard about the call: `POST /calls/started` when the caller joins and `POST /calls/ended` on shutdown, so the Live pill shows "On Call" and the Call Cortex sheet runs its 5:00 timer. Best effort: it never blocks or ends a call.
5. Video back to the caller (CALL-4; fallback: an iMessage attachment).

## Chert limits

Calls cap at 5 minutes. A line serves one call at a time. The agent process and the Chert connector must both keep running, so a laptop hosts the demo. Outbound calls only reach phones verified by an iMessage code. The trial is 50 FaceTime minutes. **Do not start the trial early**: see the M0 spike on how the track's free 48-hour line is issued.

## Setup outline (check Chert's docs first)

Chert's skill file is at https://app.trychert.com/skills.md and its docs are at https://docs.trychert.com. Read the video guide (`chert guide video`) to confirm how caller camera frames arrive. Keys go in `.env` (`CHERT_API_KEY`, `CHERT_PROJECT_ID`, `LIVEKIT_*`, `AGENT_NAME`), never in chat or the repo.

## Connect it to Cortex

Set `CORTEX_API_URL` in `agent/.env.local` (default `http://127.0.0.1:4010`, the stateful mock from `make dev`). The hosted backend is in [STATUS.md](../../docs/STATUS.md); its database is the demo data, so point real test calls at it only on purpose (saved moments and "On Call" events show on the live dashboard).

## Hosting

No laptop should run any Cortex or Chert process. Two Railway services in the `cortex-api` project do the laptop's two jobs ([ADR 0006](../../docs/decisions/0006-call-agent-hosting.md), Proposed):

| Service | Folder | Runs | Needs |
| --- | --- | --- | --- |
| `call-agent` | `agent/` | the LiveKit worker (`node agent.mjs start`), outbound only | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY` (you add these), plus `AGENT_NAME`, `CORTEX_API_URL` and `CORTEX_API_KEY` (already set; the key is a reference to the `api` service's) |
| `chert-connector` | `connector/` | `chert dev --agent $AGENT_NAME`, which holds the FaceTime line | its `LIVEKIT_*` and `AGENT_NAME` are references to `call-agent`'s, so enter them once there; a **volume at `/data`** keeps the Chert sign-in (`CHERT_HOME=/data/chert`) |

Both refuse to start and say which variables are missing, and print an image check (the agent: native LiveKit library loads; the connector: the Chert CLI version). The agent image installs `ca-certificates`: LiveKit's native client needs the system roots, and without them every job fails with "no native root CA certificates found" (the library still loads, so the image check alone does not catch it).

**First sign-in:** with the variables set, the connector logs a Chert link and code (`chert login --device`). The project owner or admin opens it and approves; the sign-in lasts 30 days and is kept on the volume. It then runs `chert doctor` once (ignore its OpenAI "model" failure) and `chert dev`, and restarts `chert dev` 20 s after it exits. A redeploy sends SIGTERM and waits for the line to be released (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60`).

**Deploy** from inside each folder (Railway's CLI rejects a path argument here) after `railway login`:

```bash
cd apps/call-agent/agent && railway up --service call-agent --project 0442773d-27f9-461e-9270-67bebc60177b --environment production --ci
```

```bash
cd apps/call-agent/connector && railway up --service chert-connector --project 0442773d-27f9-461e-9270-67bebc60177b --environment production --ci
```

Never run the laptop's `chert dev` while the server's is up: one session holds the line. Do not run `chert login` on another computer for the same project until it is clear that signing in again does not revoke the server's credential. `make test` covers `connector.sh` and `start.sh` against a stub `chert`.

## Reading the agent's logs

In Railway (`call-agent` → Deployments → View logs). One JSON line per event:

- `cortex="call"`: a call started; `callId` is Chert's call id.
- `cortex="tool"`: a memory tool ran: `name` (`ask_memory`, `brief_person`, `save_what_you_see`), `ok`, `ms`, and `grounded`, `found` or `reason`. It never contains the question, the name asked about or the note.
- `cortex="request_failed"` and `cortex="retrying"`: a Cortex API call failed; a 502/503/504 or refused connection is retried twice (after 1 s and 2 s) for lookups, never for saving a picture or for a timeout. `/calls/started` and `/calls/ended` answer 404 until the call-lifecycle endpoints are deployed.
- `vision="frame_sent"`: the caller's camera is reaching Gemini. Idle warm rooms end every ~5 minutes with "Room disconnected while waiting for participant": Chert recycling, not a fault.

A saved picture's transcript is stored as `Shown on the call: <note>`, so it is not mistaken for something the caller said.

## Test it

`make test` runs the client and tool tests against a fake Cortex API (no install needed); `make lint` syntax-checks the agent. Both run inside `make check`.

## Run it alone

Run the Cortex side against the mock API (`make mock`). The call side needs a real Chert line and LiveKit project, so label an issue `needs-human` when it needs a phone or a key.
