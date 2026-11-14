# Plan: tiers and ids

The priority plan is the source of truth: [Cortex Core Priority Plan - Flawless Demo.md](../Cortex%20Core%20Priority%20Plan%20-%20Flawless%20Demo.md). This page only carries the tier list and the ids used in issues and [STATUS.md](STATUS.md).

## Tier 0: must work (if any fails, the demo fails)

| Id | Must work | Done when |
| --- | --- | --- |
| T0-1 | Capture to backend: camera and mic (glasses, or phone fallback) into one ingest pipeline storing transcript, caption, snapshot, timestamp | Saying a sentence and showing an object produces a stored moment within a few seconds |
| T0-2 | Shared memory with search that returns the source moment | Asking about something from earlier returns the right moment, every time, on the seeded data |
| T0-3 | Network skill: introduction creates a contact card | "This is Priya from Acme" produces a correct card with the moment linked |
| T0-4 | Waiting-on tracker with a one-tap confirm chip | A spoken promise becomes a tracked item with who, what and due date |
| T0-5 | Ask with a proof receipt | A voice question gets a spoken answer and a receipt showing the source moment |
| T0-6 | Pre-meeting brief, spoken | "Brief me on Priya" returns a correct 20-second brief from stored data |
| T0-7 | Action loop for one action: follow-up email | Propose, confirm, send (or save draft), then a receipt with undo |
| T0-8 | Live dashboard: Live, Timeline, Ask, Proof receipts | Updates appear on screen within seconds while the demo runs |
| T0-9 | Privacy minimums: pause or off-the-record, and delete a moment | Both work on stage and are visible to judges |
| T0-10 | Chert inbound call answered from memory, with caller camera on one object or document | An iPhone FaceTime reaches Cortex, which greets in time (within 10 s), answers from memory and saves what the camera shows |
| T0-11 | Demo reliability: seeded data, frozen script, recorded backup video | The full script runs start to finish without touching code, twice in a row |

Fresh use of video is weighted double in the Chert track, so T0-10 (the camera) is not optional.

## Tier 1: only after Tier 0 passes twice in a row and the script is rehearsed (in this order)

1. T1-1 Agent video back on the call (fallback: iMessage attachment with the proof card).
2. T1-2 Outbound call for a pre-meeting brief (phone verified in advance).
3. T1-3 Daily digest and rewind ("what did I do today?").
4. T1-4 A second mode that visibly behaves differently (for example Student turning a snapshot into flashcards).
5. T1-5 Persona and framing on calls.

## Cut for the hackathon

Face recognition, memory graph, car mode, smart tags and ambient hub, multi-user sharing, whisper coach, live translation, language immersion, proactive nudge, cooking or repair coach, and Assist beyond a simple read-aloud. Ask the world stays out unless it comes free from memory search. These go on the roadmap slide, not in the demo.

## Build order and freeze

Build order, go/no-go checks and fallbacks: see the priority plan. Feature freeze (proposed): at least 6 hours before judging; after that, bug fixes and rehearsal only (at least 10 runs).
