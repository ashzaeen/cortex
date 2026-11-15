# Blockers: what stops a Tier 0 run-through

Snapshot, 2026-11-14 late evening · @ashzaeen. Replaces the 7:20 meeting snapshot. Every agent: read this after [AGENTS.md](../AGENTS.md) and [STATUS.md](STATUS.md), before you start a task. The full feature list is in [Cortex - Complete Feature Specification.md](../Cortex%20-%20Complete%20Feature%20Specification.md).

## TL;DR

1. The real stack is up. The backend runs on Railway on real Atlas, Tiger Data and Gemini, and the Vercel dashboard talks to it. **T0-2 is the first Tier 0 item that `works`** (search returned the right source moment 12 of 12 times on the hosted backend).
2. The other backend items (T0-3 to T0-7, T0-9) pass offline but have not had their done-when test run on the real stack. That is now the cheapest progress available.
3. The last unjoined part is the **call agent**: it talks on real FaceTime calls but does not call the Cortex API (T0-10).
4. Capture is wired in code (glasses app and phone fallback both post moments) but has never run on a real iPhone or the Gen 1 glasses. That is a hardware and people blocker.
5. Tier 1, Should and Roadmap work stays blocked until all of Tier 0 is `works` twice in a row.

## 1. Tier rule: the spec is mostly gated

Per AGENTS.md, no Tier 1, Should or Cut work starts while any Tier 0 item is not `works`. Today: 1 of 11 `works`, 10 `in progress`.

**Blocked until Tier 0 passes twice:** MEM-9 digest, MEM-10 rewind, MODE-2 to MODE-6, DASH-10 Modes tab, DASH-11, CALL-4 video back, CALL-5 outbound call, ACT-5 to ACT-10, the backend half of #41 (#45), and every Should item.

**Waived on purpose (@ashzaeen, 2026-11-14):** the #41 contract change, the Brass redesign and the browser-only `/demo` profile (#44) are on `main`. Also waived (@ashzaeen, 2026-11-15): ACT-5 calendar, ACT-6 tasks, ACT-7 notes and flashcards to Drive, ACT-9 texts through Chert, and the backend half of #41 (#45). They are built and tested offline; live Google writes and Chert sends are not yet verified. Nothing else in this list is waived.

## 2. Verification gap: works offline, not yet proven live

| Item | Offline (mongomock + mock LLM) | Real stack | What's missing |
| --- | --- | --- | --- |
| T0-2 search | passes | **works** (12/12) | nothing |
| T0-3 introduction card | passes | not run | Run on a scratch database, not the demo data |
| T0-4 promise tracker | passes | not run | Gemini extraction of who, what and due |
| T0-5 ask with proof | passes | grounded `/ask` seen once (#42) | Voice question from capture, spoken answer |
| T0-6 brief | passes (template) | not run | Gemini brief, spoken through the glasses |
| T0-7 follow-up email | passes (dry run) | not run | One real send through SMTP or Resend |
| T0-9 pause and delete | passes | not run | Delete cascade on Atlas and Tiger Data |

**Unblock:** @ClosetCoderSad runs each done-when test against a real but **separate** Atlas database (the hosted one holds the demo seed, and these tests write), comments **How I verified this** on #15 to #21, and updates STATUS.md.

## 3. Human and hardware blockers (`needs-human`)

| Issue | Blocker | Blocks | Owner |
| --- | --- | --- | --- |
| #2 | Does the Meta toolkit deliver camera frames on Gen 1 glasses? Go/no-go | T0-1 glasses path | @794KHSameer |
| #10 | Glasses confirmed for testing and demo day | T0-1, T0-11 | @794KHSameer |
| #3 | Capture latency and frame rate measured | T0-1 | @794KHSameer |
| #36, #39 | Run the iOS app on a real iPhone (iOS 17.2+) with the Gen 1 glasses. Simulator builds pass; @ashzaeen has no iPhone | T0-1 | @ahnafzabir-utd, @794KHSameer |
| #42 | Open the Vercel dashboard on an iPhone and check that the live timeline loads from the hosted backend | T0-8 | @ashzaeen (needs someone's iPhone) |
| #6 | How the free Chert line is issued, whether the trial clock has started, and which teammate's iPhone gets the iMessage code | T0-10 | @ahnafzabir-utd |
| #7 | Our own LiveKit project and env | T0-10 | @ahnafzabir-utd |
| #11 | Greeting within 10 s: seen at about 5 to 7 s on real calls (handoff); needs to be recorded on the issue and closed | T0-10 | @ahnafzabir-utd |
| #12 | Demo phone verified for outbound calls and texts | T1-2, fallback | @ahnafzabir-utd |
| #30, #31, #33 | Freeze the script, record the backup video, at least 10 rehearsals | T0-11 | team |

## 4. Integration gaps (agent work)

| Gap | Blocks | Area |
| --- | --- | --- |
| Call agent: `ask_memory`, `brief_person` and `save_what_you_see` (on request) are written, tested offline and against a key-protected local backend on branch `claude/practical-babbage-ogm16t` (not on `main` until merged, #48). Never run on a real call. Hosting: the agent and the Chert connector are deployed as Railway services `call-agent` and `chert-connector` (images verified on Railway), waiting on four secrets, a `/data` volume and the Chert sign-in approval; until a real call works that way the laptop stays the fallback ([ADR 0006](decisions/0006-call-agent-hosting.md), Proposed) | T0-10 | call (#22) |
| The hosted backend answers 401 without `X-Cortex-Key` (#47): the call agent (`CORTEX_API_KEY`) and the iOS app (`CORTEX_API_KEY` build setting) now send it on this branch; the key itself must be given to each, privately | T0-1, T0-10 | call, capture |
| Voice on the glasses: the iOS app only posts photos and videos and plays nothing back. The phone's Safari dashboard now has tap-to-talk and reads answers aloud (Web Speech, glasses audio over Bluetooth); a native voice loop in the app is not built | T0-5, T0-6 | dashboard (done, untested on a phone), capture |
| Spoken words in videos were dropped (`transcript: null`); the perception prompt now returns them and ingest stores them. Offline tests only: not yet seen with real Gemini | T0-1 | backend (#13) |
| Re-meeting seeded Ash: the backend must link the moment to the existing card and emit `person.updated` (the mock already does) | T0-3, T0-11 (#29) | backend, contracts (#43) |
| Ash's earlier career-fair meeting is not seeded, because it waits on #43 | T0-6 brief, T0-11 | demo (#29) |
| The iOS app has no pause or off-the-record controls of its own; it only checks `GET /privacy` before posting | T0-9 on the glasses | capture (#36) |

## 5. Housekeeping the owners should do

- **#5** (how caller camera frames reach our code) is answered by the merged call agent (`vision.mjs`); @ahnafzabir-utd can close it.
- **#4** (phone-capture fallback) is built as the dashboard's Capture sheet and verified on the mock; @794KHSameer can close it or say what's left.
- `apps/call-agent/agent/agent.mjs.before-vision` is a leftover backup in the repo (@ahnafzabir-utd).
- `contracts/README.md` still says "Status: Proposed", though every area builds against it (@ClosetCoderSad).
- The hosted backend does not redeploy on push. After a backend change, run `railway up --ci --service api` from the repo root (see [apps/backend/README.md](../apps/backend/README.md)).

## 6. Open decisions

- [ ] Is the plan's frozen demo final over the PRD demo, which has Student, Life and Assist beats? (#30)
- [ ] Do calendar and task actions (ACT-5, ACT-6) return after Tier 1, or stay out?
- [ ] ADR 0004 (sponsor stack) is still Proposed. The call agent already uses LiveKit Agents (Node) and Gemini Live; @ahnafzabir-utd can accept it as built. The spec's PLAT-3 still calls 0001 to 0004 Proposed; 0001, 0002, 0003 and 0005 are Accepted.
- [ ] @ClosetCoderSad reviews #41's looser `person_id` on the T0-7 action, and schedules #45.
- [ ] Which one extra skill or mode goes in the demo after rehearsal?

## Next actions, by person

| Who | Do next |
| --- | --- |
| @ClosetCoderSad | Real-stack done-when runs for T0-3 to T0-7 and T0-9 on a scratch database; #43 re-introduction |
| @ahnafzabir-utd | Wire the call agent to `POST /ask`, the brief and `POST /moments` (#22); close #5 and #11; #6 Chert line, #7 LiveKit |
| @794KHSameer | #2 glasses go/no-go, #10 glasses for demo day, #3 latency; run the iOS app on a real iPhone (#36, #39) |
| @ashzaeen | iPhone check of the Vercel dashboard (#42); #29 seed Ash after #43; #30 freeze the script |
| Every agent | Tier 0 only. Claim per AGENTS.md, and update this file or STATUS.md when a blocker clears |
