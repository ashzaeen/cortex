# Cortex x Chert: call layer handoff for the companion app

For: the teammate building the companion app (phone app and web dashboard).
Written: Nov 14, 2026, from a working test setup. Source plan: *Project Cortex - Product Concept for HackUTA 2026*, "Call layer" section (pages 12 and 13).

## TL;DR

- Cortex now has a **real FaceTime number** that answers video calls with an AI agent. A caller sees an animated face, hears the agent, and **the agent can see the caller's camera** (a still image about once a second).
- That agent is a **stand-in**. It is a generic everyday-tasks assistant and is **not connected to the Cortex backend yet**. Wiring it to memory, modes and actions is the next job, and it depends on backend functions the companion app and the call agent will both use.
- The call layer is a channel adapter over the same backend, as the plan says. The companion app needs to show what happened on calls, and to treat calls as capture (so privacy and consent apply to them too).

## 1. What works today (tested on real calls)

| Capability | Status |
|---|---|
| Inbound FaceTime Video call to the Chert line, answered by our agent | Works |
| Agent speaks (Gemini Live voice) and listens, with natural turn-taking | Works |
| Agent publishes video back to the caller (an animated face that moves while it talks) | Works |
| **Caller camera to agent**: the agent receives the caller's camera, sends ~1 image/second to Gemini, and answers about what it sees | Works. The user held things up and the agent described them |
| Agent greets on the `bridge_ready` signal, which is required or the call ends after 10 s | Works |

This closes the plan's open question *"how the caller's camera frames reach our code"*. Chert's docs say the bridge participant (`chert-bridge-<call id>`) publishes a track named `facetime-remote-video`. Our agent subscribes to that track. Details in section 6.

## 2. What is not built or not tested

- The agent is **not wired to Cortex** (no memory lookup, modes, actions, proof receipts, brief or waiting-on logic). It currently answers from its own prompt.
- **No camera frames or transcripts are saved anywhere.** Nothing from calls reaches the timeline yet.
- **Agent video back** shows only the animated face. Showing a briefing, snapshot or proof receipt on video is not built (the agent can publish any frames, it just does not yet).
- **Outbound calls** (Cortex rings you for a brief or approval) are not tested. Chert has an outbound API (`POST /api/v1/calls`) that we have not touched.
- **iMessage attachments** (the plan's fallback for video back) are not tested.
- **Glasses footage feeding a call** is still unverified, as in the plan.
- Group calls are not tested.

## 3. How a call flows

```
iPhone FaceTime  ->  Chert line (number in team chat)  ->  LiveKit room  <-  our agent (Node)
                                                         |  caller camera track, ~1 image/s -> Gemini Live
                                                         |  agent voice + animated-face video -> caller
                                                         v
                                              [TODO] Cortex backend functions
```

- A small Chert process, `chert dev`, runs on a laptop and holds the line. Our agent runs next to it. **Both must stay running or calls fail.**
- The agent connects to **our own LiveKit Cloud project**. Models: Gemini Live (`gemini-2.5-flash-native-audio-preview-12-2025`, voice "Puck").
- Timing seen: Chert answers in under 0.5 s, and the agent can greet about 5 to 7 s after the caller taps call, so the caller hears silence for a few seconds first.

## 4. What this means for the companion app

The call agent will use the same backend as the glasses and the app. By tab:

- **Live**: show a "on a call" state. The capture indicator must be on during a video call, because **camera images are sent to Google's Gemini service while the call is live**.
- **Timeline**: calls should create moments with source `facetime` (transcript lines, plus a snapshot when the caller shows something, such as a business card).
- **Ask**: the call agent calls the same answer function. Answers should be short enough to speak, and carry source moment IDs so the agent can mention or show proof.
- **Proof receipts**: for "show me the source moment" on a call, the agent needs a **renderable image** of a receipt or moment (for example a stable URL to a PNG card). The agent then publishes it as video frames. Please keep receipts renderable as a standalone image, not only as a UI component.
- **Modes**: the agent should read the current mode from the backend at the start of each call.
- **Actions and approvals**: an outbound "needs your approval" call and the app must resolve the **same pending action**. Make confirm idempotent, so a spoken yes and an app tap cannot both fire it.
- **Privacy tab**: calls are capture. "Forget" must cover call moments. The plan's consent rules apply to people shown on camera. The agent is told not to identify people or infer personal traits, but nothing enforces that.

## 5. Proposed backend contract (a draft for the team to agree, not decided)

The plan names four functions the call agent will use. Suggested shapes:

| Function | Suggested call | Returns |
|---|---|---|
| Ingest a moment | `POST /moments` `{source: "facetime", call_id, ts, transcript?, caption?, image?}` | `{moment_id}` |
| Answer a question | `POST /ask` `{q, mode, call_id?}` | `{spoken_text, moment_ids[], proof_image_url?}` |
| Brief on a person | `GET /people/:id/brief` | `{spoken_text, bullets[], moment_ids[]}` |
| Propose or confirm an action | `POST /actions` and `POST /actions/:id/confirm` | `{action_id, status}` |

Also useful: `GET /mode` (current mode), and a way for the call agent to report `call_started` / `call_ended` so the Live tab can show it.

## 6. Constraints to design around (from Chert, verified or in their docs)

- **Calls cap at 5 minutes**, and a line serves **one call at a time**. The demo's call segment must fit in one call.
- **Greet within 10 s** of `bridge_ready` or the call ends. Never greet just because someone joined.
- **Only phones verified for the project can be called or texted.** Verification is an iMessage code sent from that iPhone. Anyone else can be let in by texting a **join phrase** to the line once; after that they can call it and be called. Get the phrase from the Chert dashboard (Messages page), and rotate it after the demo, because anyone with it can call the agent.
- **Caller capture is a per-line setting** in Chert (docs call it an "independent caller-capture opt-in"). It works on our line. If we ever get a different line, check it is on.
- The caller's capture **may include FaceTime buttons or the caller's own preview** (Chert's docs say this), so images are not always a clean camera view. The agent also has to cope with the caller muting their camera.
- **Trial limits**: 50 FaceTime minutes total. Several were used in testing, so check the live count with `chert doctor`. The CLI says the trial lasts **24 hours from activation**, while Chert's hackathon page mentions 48 hours. Check the real expiry in the Chert dashboard before demo day.
- The plan said not to start the trial early. **The trial was started on Nov 14.** If the line expires or is released (an unconnected trial line is only held for a few hours), `chert onboard` gets a new line back with minutes kept, but **the phone number may change**. Do not hard-code the number in the app or slides without checking.
- **Dropped calls**: the first three test calls were answered and then dropped (the Chert relay closed the connection). Calls worked after restarts, but we never found the cause. Wait about 30 seconds between calls, and do not redial instantly. Rehearse the call segment more than the rest.

## 7. Running it and where things live

- The test agent is a Node project (Node 24) called **`my-video-agent`**. It is **currently in a temporary session folder, not in the repo**. Move it into the repo before anyone edits it.
- Files: `agent.mjs` (agent, prompt, greeting), `vision.mjs` (camera frames to Gemini), `face.mjs` (animated face), `greet.mjs` and `chert-rooms.mjs` (Chert starter code, leave alone).
- Run: `npm start` in one terminal, `chert dev --agent my-video-agent` in another (Chert CLI package `@trychert/facetime@0.1.0-beta.21`).
- Secrets live only in `.env.local`: three LiveKit values, `GOOGLE_API_KEY`, `AGENT_NAME`. **Never commit that file or paste the values into chat.** Ask the owner for them or create your own LiveKit and Gemini keys.
- `chert doctor --agent my-video-agent` checks setup. Its "model" check only knows OpenAI keys, so it fails for our Gemini agent. **Ignore that one failure.**
- You need an iPhone to test calls. The line is verified for one phone only, so others must text the join phrase first.

## 8. Open questions for the team

1. Who owns wiring the call agent to the backend, and when does the backend expose the functions above?
2. What does the agent show on video for a proof receipt (a card image, or the live dashboard)?
3. Can glasses footage feed a call, or is the call camera always the phone's?
4. Do we want the agent to save a snapshot automatically when a caller shows something, or only when they say so?
5. Which phones must be verified or joined before the demo (judge phones, teammate phones)?

## 9. References

- Chert FaceTime docs: https://docs.trychert.com/facetime/introduction (also `audio-video`, `capabilities`, `limits`, `calls-api`, `outbound` under the same path)
- Chert CLI docs: https://docs.trychert.com/facetime-cli/overview
- HackUTA Chert page: https://www.trychert.com/uta
- Setup file the plan cites: https://app.trychert.com/skills.md
