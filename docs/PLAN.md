# Plan: the demo checklist

**The tier system is gone (decided by @ashzaeen, 2026-11-15).** Nothing is gated: any feature in the [feature spec](../Cortex%20-%20Complete%20Feature%20Specification.md) can be built at any time. The old Tier 1 and Cut items are ordinary features now. Two rules stay, because they are safety rules, not priorities: **no face recognition**, and **people enter memory only by introduction or consent** (AGENTS.md).

What stays is the list below: the eleven things the 3-minute demo ([DEMO_SCRIPT.md](DEMO_SCRIPT.md)) needs on stage. It doesn't block other work; it shows what the demo needs. Their state lives in [STATUS.md](STATUS.md). The ids `D-1` to `D-11` replace the old `T0-1` to `T0-11`.

The [priority plan](../Cortex%20Core%20Priority%20Plan%20-%20Flawless%20Demo.md) is kept unchanged as a source file; its tiers and cut list are superseded by this page. Examples use the name **Ash** where it says Priya (see [RISKS.md](RISKS.md), item 8).

## Demo checklist

| Id | Must work for the demo | Done when |
| --- | --- | --- |
| D-1 | Capture to backend: camera and mic (glasses, or phone fallback) into one ingest pipeline storing transcript, caption, snapshot, timestamp | Saying a sentence and showing an object produces a stored moment within a few seconds |
| D-2 | Shared memory with search that returns the source moment | Asking about something from earlier returns the right moment, every time, on the seeded data |
| D-3 | Network skill: introduction creates a contact card | "This is Ash from Acme" produces a correct card with the moment linked |
| D-4 | Waiting-on tracker with a one-tap confirm chip | A spoken promise becomes a tracked item with who, what and due date |
| D-5 | Ask with a proof receipt | A voice question gets a spoken answer and a receipt showing the source moment |
| D-6 | Pre-meeting brief, spoken | "Brief me on Ash" returns a correct 20-second brief from stored data |
| D-7 | Action loop for one action: follow-up email | Propose, confirm, send (or save draft), then a receipt with undo |
| D-8 | Live dashboard: Live, Timeline, Ask, Proof receipts | Updates appear on screen within seconds while the demo runs |
| D-9 | Privacy minimums: pause or off-the-record, and delete a moment | Both work on stage and are visible to judges |
| D-10 | Chert inbound call answered from memory, with caller camera on one object or document | An iPhone FaceTime reaches Cortex, which greets in time (within 10 s), answers from memory and saves what the camera shows |
| D-11 | Demo reliability: seeded data, frozen script, recorded backup video | The full script runs start to finish without touching code, twice in a row |

Fresh use of video is weighted double in the Chert track, so D-10 (the camera) matters for that prize.

## Also in the feature spec (not gated)

The ideas that used to be Tier 1 or Cut are normal features with spec entries, built whenever someone picks them up. Examples: agent video back on calls, outbound calls for a brief, daily digest and rewind, a second visibly different mode, call persona and framing, memory graph, car mode, smart tags, multi-user sharing, whisper coach, live translation, language immersion, proactive nudge, and the cooking or repair coach.

## Freeze before judging

Feature freeze (proposed): at least 6 hours before judging. After that, bug fixes and rehearsal only (at least 10 runs).
