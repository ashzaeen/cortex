# Blockers: what stops us building the feature spec

Snapshot for the 7:20 team meeting, 2026-11-14 · @ashzaeen. Every agent: read this after [AGENTS.md](../AGENTS.md) and [STATUS.md](STATUS.md), before you start a task. The full feature list is in [Cortex - Complete Feature Specification.md](../Cortex%20-%20Complete%20Feature%20Specification.md); this file says why most of it can't start yet and what unblocks it.

## TL;DR

1. Most of the feature spec is Tier 1, Should or Roadmap work. It stays blocked until every Tier 0 row in STATUS.md reads `works`, and Tier 0 has passed twice in a row.
2. The backend is further along than STATUS.md says. 19 tests pass, including done-when tests for T0-1 to T0-7 and T0-9, but only on mongomock and the mock LLM. Nobody has verified it on the real stack yet.
3. The real blockers are human and hardware tasks: glasses, a Mac and an iPhone, the Chert line, LiveKit, and the Vercel deploy.
4. The parts aren't joined yet: the dashboard runs on the mock, the call agent doesn't read memory, and the capture app doesn't post moments.
5. Unpushed Tier 1 contract work (#41) on one machine fails `make check`. Hold it until the owner decides.

## 1. Tier rule: the spec is mostly gated

Per AGENTS.md, no Tier 1, Should or Cut work starts while any Tier 0 item is not `works`. Today STATUS.md shows 10 Tier 0 items `not started` and T0-10 `in progress`.

**Blocked until Tier 0 passes twice:** MEM-9 digest, MEM-10 rewind, MODE-2 to MODE-6, DASH-10 Modes tab, DASH-11, CALL-4 video back, CALL-5 outbound call, ACT-5 to ACT-10, and every Should item.

**Agents:** if your task maps to any of these, stop and pick a Tier 0 issue instead.

## 2. STATUS.md is stale

| What STATUS.md says | What the repo shows (checked 2026-11-14) |
| --- | --- |
| T0-1 to T0-9: `not started` | `apps/backend/` implements ingest, search, network, promises, ask, brief, follow-up email and delete. `pytest` gives 19 passed: done-when tests for T0-1 to T0-7 and T0-9, plus contract and event tests. |

**Caveat:** the tests run on mongomock with `LLM_MOCK`, not the real database or Gemini. Under the rules none of these can be `works` until someone runs the done-when test on the real stack.

**Unblock:** @ClosetCoderSad runs each done-when test against the real DB and LLM, comments **How I verified this** on #13 to #21, and updates STATUS.md. Close #40 if `GET /actions` (d6b423a) is done.

## 3. Human and hardware blockers (`needs-human`)

| Issue | Blocker | Blocks | Owner |
| --- | --- | --- | --- |
| #2 | Does the Meta toolkit deliver camera frames on Gen 1 glasses? Go/no-go | T0-1 (glasses path) | @794KHSameer |
| #10 | Glasses confirmed for testing and demo day | T0-1, T0-11 | @794KHSameer |
| #3 | Capture latency and frame rate measured | T0-1 | @794KHSameer |
| #36, #39 | Mac with Xcode 26.4+ and an iPhone on iOS 17.2+ for the capture app. @ashzaeen has no iPhone | T0-1 | @ahnafzabir-utd |
| #6 | How the free Chert line is issued (48 h or 50 min?), whether the clock has started, and which teammate's iPhone gets the iMessage code | T0-10 | @ahnafzabir-utd |
| #7 | Our own LiveKit project and env set up | T0-10 | @ahnafzabir-utd |
| #11 | Greeting within 10 s in a test call | T0-10 | @ahnafzabir-utd |
| #12 | Demo phone verified for outbound calls and texts | T1-2, fallback | @ahnafzabir-utd |
| #38 | Dashboard deployed to Vercel. Phone camera and mic need HTTPS, so the phone fallback can't be tested on an iPhone without it | T0-1 fallback, T0-8 | @ashzaeen |

## 4. Integration gaps (agent work, once owners agree)

| Gap | Blocks | Area |
| --- | --- | --- |
| Dashboard still talks to the mock (`apps/dashboard/mock`), not the real backend | T0-8 | dashboard |
| Call agent greets and sees the caller's camera, but doesn't call `POST /ask` (channel `call`) or save the camera view as a `call` moment | T0-10 | call |
| iOS capture app doesn't post moments yet | T0-1 | capture |
| No seeded demo data or frozen script, so the full run-through can't be rehearsed | T0-11 | demo (#23, #29, #30) |

## 5. Unpushed Tier 1 work on @ashzaeen's machine: hold

Two pieces of work sit on @ashzaeen's local `main` and are **not** in this push.

**Local commit `2b0b9cc`, for #41 (`contract-change`):**
- `POST /modes/{id}/activate` and a `mode.changed` event
- action types `flashcards`, `reminder` and `read_aloud`
- `deliver: do` and a `done` status
- `person_id` no longer required on propose
- edits to the backend (`api/routes.py`, `core/events.py`, `memory/store.py`), the mock and the generated `api-types.ts`

**Uncommitted Brass dashboard UI:** `components/brass/` plus the `three`, `motion` and `lucide-react` dependencies.

**Why hold:**
- `make check` fails with `2b0b9cc` in place. `apps/dashboard/components/tabs.tsx:62` reports `'a.draft' is possibly 'undefined'` because the contract made `draft` optional, so pushing it would turn `main` red.
- It's Tier 1 work (modes and flashcards) while Tier 0 isn't done.
- `contracts/` and `apps/backend/` belong to @ClosetCoderSad, who hasn't signed off on #41.
- Making `person_id` optional loosens the T0-7 contract.

**Decide at the meeting:** park #41 until Tier 0 passes, or fix `tabs.tsx`, get @ClosetCoderSad's OK on #41, and land it then.

## 6. Open decisions for the meeting

- [ ] Is the plan's frozen demo final over the PRD demo, which has Student, Life and Assist beats?
- [ ] Do calendar and task actions (ACT-5, ACT-6) return after Tier 1, or stay out?
- [ ] Seed earlier Ash moments, or create Ash only live?
- [ ] ADR 0004 (sponsor stack) is still Proposed: who decides, and by when? ADRs 0001, 0002, 0003 and 0005 are Accepted. The spec's PLAT-3 still calls 0001 to 0004 Proposed and needs a fix.
- [ ] Which one extra skill or mode goes in the demo after rehearsal?

## Next actions, by person

| Who | Do next |
| --- | --- |
| @ClosetCoderSad | Verify T0-2 to T0-7 and T0-9 on the real stack, update STATUS.md, and rule on the uncommitted contract changes |
| @794KHSameer | #2 glasses go/no-go, #10 glasses for demo day, #3 latency |
| @ahnafzabir-utd | #6 Chert line and iPhone, #7 LiveKit, #11 greeting test; then wire the call agent to `POST /ask` and `POST /moments` |
| @ashzaeen | #38 Vercel deploy, point the dashboard at the real backend, #29 seed data, #30 freeze script |
| Every agent | Tier 0 only. Read this file, claim per AGENTS.md, and update this file or STATUS.md when a blocker clears |
