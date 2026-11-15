# Architecture

Everything flows through one shared memory, so modes are presets over it and channels (glasses, phone, dashboard, FaceTime) are adapters to it. The interface between every box below is [contracts/openapi.yaml](../contracts/openapi.yaml). Accepted: backend stack ([ADR 0001](decisions/0001-backend-stack.md): Python, FastAPI), data store ([ADR 0002](decisions/0002-data-store.md): MongoDB Atlas with Vector Search for memory, Tiger Data for the time index and audit log), capture path ([ADR 0003](decisions/0003-capture-path.md)) and dashboard stack ([ADR 0005](decisions/0005-dashboard-stack.md)). Still Proposed: call-agent stack ([ADR 0004](decisions/0004-sponsor-stack.md)); as built it is Node with LiveKit Agents and Gemini Live.

**Where it runs:** the dashboard on Vercel, the backend on Railway (one Docker process, `apps/backend/Dockerfile`), the call agent and Chert connector on a laptop, the glasses app on an iPhone.

```
 Glasses (native iOS) ───┐
                         ├─► apps/capture ──POST /moments──┐
 Phone camera + mic ─────┘   (fallback, same endpoint)     │
                                                           ▼
 iPhone FaceTime ─► Chert line ─► LiveKit room ◄─► apps/call-agent ──► apps/backend ◄── apps/dashboard
                                                   (same API calls)    memory + brain     (REST + GET /events)
                                                                         │
                                                                    Atlas + Tiger Data (ADR 0002)
                                                                    email action (draft/send)
```

## Capture
`apps/capture` turns audio and camera into **moments** (transcript, caption, snapshot, timestamp, source) and posts them to `POST /moments`. The glasses camera needs Meta's native SDK, so a small native iOS app streams it ([ADR 0003](decisions/0003-capture-path.md)); the glasses also act as a Bluetooth mic and speakers for the web app. If Gen 1 cannot stream, the web app's phone capture screen posts to the same endpoint. Capture is cue-based by default and honours pause and off-the-record.

## Memory
`apps/backend` stores moments with an embedding, and runs search that always returns the source moments behind a result (`GET /moments/search`, `POST /ask`). Skills read and write memory: Network creates **people** from introductions, the waiting-on tracker creates **promises** (proposed, then confirmed with one tap), and the brief reads a person's moments and open promises (`GET /people/{id}/brief`).

## Modes
A **mode** (Focus, Student, Life, Assist) is a preset over the same memory: what it captures, when it speaks, what it proposes, which actions it may take. Search crosses modes. The dashboard switches modes from the dock, and each mode suggests its own kind of action.

## Action loop
Notice, propose, confirm, do, prove. `POST /actions/propose` creates a proposed action (the follow-up email) with its source moments; `POST /actions/{id}/confirm` sends it or saves a draft and writes a **receipt**; `POST /actions/{id}/undo` reverses it while the undo window is open. Anything that leaves the device needs a confirm.

## Call layer
A Chert line bridges an iPhone FaceTime call into our own LiveKit room. `apps/call-agent` joins the room, greets within 10 seconds, turns caller camera frames into moments (`POST /moments` with source `call`) and answers with `POST /ask` and the brief endpoint. Limits: 5-minute calls, one call at a time per line, the agent and Chert connector must both keep running, outbound only to iMessage-verified phones, 50 trial minutes.

## Live updates
The dashboard is one responsive, iPhone-first Next.js web app on Vercel (the same app on the laptop is the judges' view). It calls the API through its own same-origin `/api` proxy, reads REST endpoints and subscribes to `GET /events` (Server-Sent Events: `moment.created`, `person.created`, `promise.proposed`, `receipt.created` and others) so updates appear within seconds.

## Privacy
`POST /privacy/pause` stops capture (or marks off-the-record); `DELETE /moments/{id}` removes a moment and everything derived from it.
