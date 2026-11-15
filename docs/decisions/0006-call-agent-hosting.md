# 0006: Where the call agent and the Chert connector run

- **Status:** Proposed
- **Decider:** call owner (@ahnafzabir-utd)
- **Issue:** #22
- **Date:** 2026-11-15

## Context
The rule is now that nothing needs a laptop: the glasses app, the call agent and the dashboard all run hosted. Today two processes run on one laptop: the LiveKit agent (`npm start`) and Chert's connector (`chert dev`). Done when a FaceTime call to the line is answered while no laptop runs any Cortex or Chert process. The question: can the connector run on a server, or can calls skip it?

Evidence is from the files shipped in `@trychert/facetime@0.1.0-beta.21` (`chert guide`, `--help`, `README.md`, `DEVELOPER_GUIDE.md`, `QUICKSTART.md`, `CLI_GUIDE.md`, `docs/BYOR_OWNERSHIP.md`). Chert's web docs (`docs.trychert.com`) were not read, and nothing below has been run on a server.

## What the docs say
- **The agent is already hostable.** With our three `LIVEKIT_*` values set, `runAgent()` takes the normal LiveKit worker path (`cli.runApp`). A worker only connects outward to LiveKit Cloud. Chert: "Your agent runs on LiveKit, wherever you host it."
- **A connector is always needed.** FaceTime has no API. Chert's Macs answer the call, and each call is handed to *something of ours* that prepares a room: "When a call rings, Chert hands the decision to your `chert dev`." No document describes routing a line straight to a LiveKit project with no Chert software of ours. The console setting *Routing: "Your webhook"* is only the name of the "customer decides" mode that the connector answers; the same docs say "No public URL, tunnel or webhook server."
- **The connector is outbound-only and runs on Linux.** `chert dev` "connects outward to Chert". It needs Node 22.12+, 24 or 26 "on macOS or Linux", the same three `LIVEKIT_*` values (environment variables work, no file needed), and `--agent <AGENT_NAME>`. Checked here: it installs and runs on Linux Node 22 with no TTY and has a `--json` mode (`chert whoami --json`, `chert doctor --json`).
- **Headless sign-in exists.** `chert login --device` prints a code to approve from any device, as the project owner or admin. The sign-in lasts 30 days and is stored under `CHERT_HOME` (default `~/.chert`), which can point at a persistent folder.
- **One session holds the line.** A disconnected session is replaced by the next `chert dev`. Without `--until` or `--minutes` it holds the line until it stops. Losing the terminal or SSH session stops it, so on a server it must run as the container's own process.
- **A second connector mode exists.** `chert byor` hands each call to a TypeScript callback that we write when we run our own rooms. No public webhook. It is documented as an internal-pilot flow: its enrollment commands do not read the `chert login` sign-in yet and need `CHERT_USER_ACCESS_TOKEN` injected.
- **Chert-run agents do not fit.** `chert agent on "<sentence>"` runs an agent for us with no keys or folder, but it cannot call the Cortex API. It also gives way while `chert dev` holds the line.

## Options
### A. Two Railway services: LiveKit worker and `chert dev` connector (recommended to try first)
- **`call-agent` service:** `node agent.mjs start` (Node 24). Variables: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY`, `AGENT_NAME`, `CORTEX_API_URL` (the hosted backend; the agent now warns at startup if it is left at localhost). No public domain.
- **`chert-connector` service:** `npm i -g @trychert/facetime@0.1.0-beta.21`, then `chert dev --agent "$AGENT_NAME" --json`. Same `LIVEKIT_*` and `AGENT_NAME`. A Railway volume mounted at `CHERT_HOME` keeps the sign-in across restarts. One time only, in a shell on that service (`railway ssh`), run `chert login --device` and have the owner or admin approve it.
- Pros: no laptop; separate restarts; nothing inbound. Cons: not yet run by anyone; needs the human approval and a volume.

### B. One service running both processes
Same as A in a single container with a small supervisor script. Fewer moving parts to configure, but one crash restarts both and loses the warm room either way.

### C. `chert byor`
Removes the `chert dev` room creation, but we would write and operate the callback module and use the pilot enrollment flow. More work for no benefit we need.

### D. Keep the laptop
Works today. Keep it as the fallback for demo day, and the only option until A has passed one real call.

## Decision
Empty until Accepted. Suggested: try A, keep D as the fallback.

## First test (needs a human; do not start the Chert trial for it)
1. The call owner runs `chert onboard --status` and the Chert dashboard to see whether the line and trial are still alive (the CLI says the trial lasts 24 hours from activation, and a line with no agent connected is released after 3 hours).
2. Deploy `call-agent` with the variables above, and check the worker registers in the LiveKit Cloud project.
3. Deploy `chert-connector`, add the volume, sign in with `chert login --device`, and wait for `agent_warm` in its logs.
4. Stop every laptop process, then FaceTime the line. Expect a greeting within 10 s of `bridge_ready`, then a memory answer and the "On Call" pill on the dashboard.
5. Redeploy the connector once and check it comes back without a new login.

## Risks to watch
- **Unverified headless run.** No document or test shows `chert dev` reaching `agent_warm` in a container.
- **Sign-in storage.** Without a persistent `CHERT_HOME`, every restart needs a new human approval. The docs also say signing in again revokes the credential it replaces; do not run `chert login` on a laptop for the same project until it is clear this will not revoke the server's.
- **Trial clock.** Trial lines expire 24 hours after activation and are released when no agent is connected. The number may change; never hard-code it.
- **One line, one call, 5 minutes.** Two `chert dev` sessions fight for the line; never run the laptop connector and the server connector at once.
- **Restarts.** After any agent change, restart both processes; the waiting room can hold old code.

## Consequences
- `apps/call-agent/README.md` and `docs/CHERT_CALL_LAYER_HANDOFF.md` still say a laptop hosts the demo; update both once this is Accepted.
- A Dockerfile for each service and a Railway setup note are the next work, once A is chosen.
- No contract change.
