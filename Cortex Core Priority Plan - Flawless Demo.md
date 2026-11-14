# Cortex Core Priority Plan - Flawless Demo

Nov 14, 2026 · @Ashzaeen

We win by shipping one flawless, rememberable 3-minute flow: meet someone, Cortex remembers their promise, then a FaceTime call proves it back on video. Everything below is ranked by whether that flow needs it.

## The hero demo (about 3 minutes)

One continuous story with a single through-line: a promise made in conversation comes back later, with proof, on a video call. Every step below uses data created earlier in the same demo, so judges see memory working rather than hear about it.

1. **Meet (20 sec).** Wearing the glasses, say "This is Priya from Acme." A contact card appears on the live dashboard with the moment attached.
2. **Promise (20 sec).** Priya says "I'll send you the deck Friday." A confirm chip appears; one tap adds it to Waiting on, with the source moment.
3. **Ask with proof (30 sec).** Ask "What did Priya promise me?" Cortex answers by voice and opens a proof receipt showing the exact moment.
4. **Brief (20 sec).** "Brief me on Priya." Cortex speaks a 20-second brief: who she is, what you discussed, what is open.
5. **Act (30 sec).** Cortex proposes a follow-up email. Approve it; it sends, and a receipt with undo appears.
6. **Call finale (60 sec).** FaceTime Cortex from an iPhone. Hold up a business card or whiteboard to the camera; Cortex saves it to memory. Ask "What is open with Priya?" and Cortex answers from memory, showing the proof card on video if video back works.

Seed the memory with a few earlier days of data before the demo so recall across time is real, and rehearse the exact script until it runs the same every time.

## Tier 0: must work

If any row fails, the demo fails. Each has a plain test for when it is done. Work on nothing else until all of these pass twice in a row.

| # | Must work | Done when |
| --- | --- | --- |
| 1 | Capture to backend: camera and mic (glasses, or phone as fallback) into one ingest pipeline that stores transcript, caption, snapshot and timestamp | Saying a sentence and showing an object produces a stored moment within a few seconds |
| 2 | Shared memory with search that returns the source moment | Asking about something from earlier returns the right moment, every time, on the seeded data |
| 3 | Network skill: introduction creates a contact card | "This is Priya from Acme" produces a correct card with the moment linked |
| 4 | Waiting-on tracker with a one-tap confirm chip | A spoken promise becomes a tracked item with who, what and due date |
| 5 | Ask with a proof receipt | A voice question gets a spoken answer and a receipt showing the source moment |
| 6 | Pre-meeting brief, spoken | "Brief me on Priya" returns a correct 20-second brief from stored data |
| 7 | Action loop for one action: follow-up email | Propose, confirm, send (or save draft), then a receipt with undo |
| 8 | Live dashboard with Live, Timeline, Ask and Proof receipts | Updates appear on screen within seconds while the demo runs |
| 9 | Privacy minimums: a pause or off-the-record control and delete a moment | Both work on stage and are visible to judges |
| 10 | Chert inbound call answered from memory, with caller camera on one object or document | An iPhone FaceTime reaches Cortex, which greets in time, answers from memory and saves what the camera shows |
| 11 | Demo reliability: seeded data, a frozen script, a recorded backup video | The full script runs start to finish without touching code, twice in a row |

Fresh use of video is weighted double in the Chert track, so row 10 (the camera) is not optional for that track.

## Tier 1 stretch and the cut list

**Tier 1: only after Tier 0 passes twice in a row and the script is rehearsed.** In this order:

1. Agent video back: show the proof receipt or briefing on the call video, with an iMessage attachment as the fallback.
2. Outbound call: Cortex rings the demo phone for a pre-meeting brief (the phone must be verified in advance).
3. Daily digest and rewind ("what did I do today?").
4. A second mode that visibly behaves differently, such as Student turning a snapshot into flashcards.
5. Persona and framing on the call: a consistent voice and look.

**Cut for the hackathon:** face recognition, memory graph, car mode, smart tags and ambient hub, multi-user sharing, whisper coach, live translation, language immersion, proactive nudge, cooking or repair coach, and Assist beyond a simple read-aloud. Ask the world stays out unless it comes free from the memory search. Mention the cut items as the roadmap in the pitch, not in the demo.

## Go/no-go checks to run first

These decide the plan. Run them before building anything else, and switch to the fallback the same day if one fails.

- [ ] Gen 1 glasses: the Meta toolkit runs on Gen 1 and delivers camera frames to our app (fallback: phone camera and mic, same pipeline).
- [ ] Capture latency and frame rate are good enough for a live demo.
- [ ] A friend's glasses are confirmed available for the demo day and for testing.
- [ ] A teammate with an iPhone is confirmed; they can send the iMessage verification code to the Chert line.
- [ ] How the track's free 48-hour Chert line is issued and when it starts (do not start the trial early).
- [ ] Chert's video guide read: how caller camera frames reach our code.
- [ ] A LiveKit project of our own created for the Chert agent.
- [ ] A greeting within 10 seconds of the bridge being ready works in a test call.
- [ ] Demo phone verified for outbound calls and texts.
- [ ] Chert track selected on Devpost, and the hardware track rules read.

## Fallbacks if something fails live

| If this fails | Switch to |
| --- | --- |
| Glasses camera or mic path | Phone camera and mic through the same pipeline; the glasses stay in the story and the demo |
| Chert call will not connect | Retry on a second verified phone; if still down, play the recorded call video and say so |
| Agent video back | iMessage attachment with the proof card, or show it on the dashboard |
| Venue wifi | Phone hotspot, with the seeded data cached locally |
| Speech misheard (names) | Confirm card lets you tap to correct; rehearse with the exact names |
| Slow answers | Pre-compute and cache the brief and the Priya answers before going on stage |
| Live person not available to play Priya | A teammate plays Priya from a fixed script |

## Build order and feature freeze

Build in this order so the demo works end to end as early as possible, then gets better:

1. Run the go/no-go checks and fix the capture path (glasses or phone).
2. Memory: ingest, store, search, and return the source moment.
3. Network skill and the waiting-on tracker.
4. Ask with proof receipts, and the pre-meeting brief.
5. Action loop for the follow-up email, plus the live dashboard.
6. Chert inbound call with caller camera, answering from the same memory.
7. Privacy controls, seeded demo data, and the recorded backup video.
8. Tier 1 items, in order, only while the demo stays stable.

**Feature freeze (proposed):** stop adding features at least 6 hours before judging. After the freeze, only fix bugs, rehearse the script at least 10 times, and prepare the Devpost writeup and the Chert track submission.

## Why not just Meta AI?

Meta AI answers questions about what you are looking at right now. Cortex remembers across days, shows exactly which moment an answer came from, and follows through with actions you approve. The demo proves it live: a promise made earlier comes back with proof, and an email goes out with an undo. Say this line before the demo and let the hero flow prove it. Judges will ask, so rehearse the answer in two sentences.
