# Architecture (Proposed)

Everything flows through one shared memory, so modes are presets over it and channels (glasses, phone, dashboard, FaceTime) are adapters to it. The interface between every box below is [contracts/openapi.yaml](../contracts/openapi.yaml). Stacks are Proposed until ADRs 0001 to 0004 are Accepted.

```
 Glasses (Meta toolkit) ─┐
                         ├─► apps/capture ──POST /moments──┐
 Phone camera + mic ─────┘   (fallback, same endpoint)     │
                                                           ▼
 iPhone FaceTime ─► Chert line ─► LiveKit room ◄─► apps/call-agent ──► apps/backend ◄── apps/dashboard
                                                   (same API calls)    memory + brain     (REST + GET /events)
                                                                         │
                                                                    data store (ADR 0002)
                                                                    email action (draft/send)
```

## Capture
`apps/capture` turns audio and camera into **moments** (transcript, caption, snapshot, timestamp, source) and posts them to `POST /moments`. Gen 1 glasses may not deliver frames through the Meta toolkit, so a phone capture client posting to the same endpoint is the fallback ([ADR 0003](decisions/0003-capture-path.md)). Capture is cue-based by default and honours pause and off-the-record.

## Memory
`apps/backend` stores moments with an embedding, and runs search that always returns the source moments behind a result (`GET /moments/search`, `POST /ask`). Skills read and write memory: Network creates **people** from introductions, the waiting-on tracker creates **promises** (proposed, then confirmed with one tap), and the brief reads a person's moments and open promises (`GET /people/{id}/brief`).

## Modes
A **mode** (Focus, Student, Life, Assist) is a preset over the same memory: what it captures, when it speaks, what it proposes, which actions it may take. Search crosses modes. The demo uses one mode; a second visible mode is Tier 1.

## Action loop
Notice, propose, confirm, do, prove. `POST /actions/propose` creates a proposed action (the follow-up email) with its source moments; `POST /actions/{id}/confirm` sends it or saves a draft and writes a **receipt**; `POST /actions/{id}/undo` reverses it while the undo window is open. Anything that leaves the device needs a confirm.

## Call layer
A Chert line bridges an iPhone FaceTime call into our own LiveKit room. `apps/call-agent` joins the room, greets within 10 seconds, turns caller camera frames into moments (`POST /moments` with source `call`) and answers with `POST /ask` and the brief endpoint. Limits: 5-minute calls, one call at a time per line, the agent and Chert connector must both keep running, outbound only to iMessage-verified phones, 50 trial minutes.

## Live updates
The dashboard reads REST endpoints and subscribes to `GET /events` (Server-Sent Events: `moment.created`, `person.created`, `promise.proposed`, `receipt.created` and others) so updates appear within seconds.

## Privacy
`POST /privacy/pause` stops capture (or marks off-the-record); `DELETE /moments/{id}` removes a moment and everything derived from it. No face recognition anywhere in the pipeline.
