# Cortex - Complete Feature Specification

Nov 14, 2026 · @Ashzaeen

## How to read this document

This is the full list of what Cortex must support, grouped from capture to demo readiness, with a priority tag on every feature so the team builds in the right order. It is built from the PRD, the Core Priority Plan, the `contracts/` folder and the repo docs as of Nov 14, 2026. Where the PRD and the priority plan disagree, the plan wins (AGENTS.md rule), and examples use **Ash** in place of the PRD's "Priya".

**Tags (no gating).** The tier system was scrapped on 2026-11-15: nothing is gated, and any feature can be built at any time. The tags below are kept only to show where a feature came from; they are not build rules.

| Tag | Meaning now |
| --- | --- |
| T0 | On the demo checklist (ids D-1 to D-11, docs/PLAN.md): the demo needs it on stage. |
| T1 | Former stretch item (old ids T1-1 to T1-5). Buildable any time. |
| Should | From the PRD's Must or Should ship list. Buildable any time. |
| Roadmap | Was planned for after the hackathon. Buildable any time. |
| Cut | Was cut for the hackathon. Buildable any time, face recognition included. |

**Feature format.** Each feature has an id, a priority tag, the repo area that owns it (`area:*` label), a description of what it is, the requirements that must be built, and a done-when test where one exists.

**Groups, in build-flow order**

| # | Group | What it covers | Main area |
| --- | --- | --- | --- |
| 1 | Capture and input | Glasses, phone fallback, speech, vision, the one ingest pipeline | capture |
| 2 | Shared memory and retrieval | Moments, people, promises, search, ask with proof, digest, rewind | backend |
| 3 | Modes | Focus, Student, Life, Assist presets over one memory | backend, dashboard |
| 4 | Skills | Network, waiting-on tracker, pre-meeting brief, extra skills | backend |
| 5 | Action loop | Notice, propose, confirm, do, prove, with undo and integrations | backend |
| 6 | Voice interaction | Spoken commands, spoken answers, confirmations, audio output | capture, backend |
| 7 | Call layer | FaceTime through Chert and LiveKit, caller camera, video back | call |
| 8 | Companion app and dashboard | Live, Capture, Timeline, Ask, Receipts, Privacy, Modes | dashboard |
| 9 | Trust, privacy and safety | Pause, delete, forget, consent, grounded answers | all |
| 10 | Platform | Contracts, backend services, events, tooling, hosting | backend, infra |
| 11 | Demo readiness | Hero script, seed data, fallbacks, rehearsal, freeze | demo |

The last two sections list the roadmap and cut items, then trace every demo checklist id to the features that deliver it.

## 1. Capture and input

Everything Cortex knows enters through one door: a moment posted to a single ingest pipeline, whatever device it came from. The glasses have no display and run no apps, so a phone app receives camera frames and audio over Bluetooth and does the rest. If the glasses path fails, a phone camera and mic feed the same pipeline.

### CAP-1 Glasses capture via Meta toolkit

**Priority:** T0 (D-1) · **Area:** capture (hardware lead @794KHSameer, iOS app @ahnafzabir-utd)

A native iOS app (Swift) built on Meta's Wearables Device Access Toolkit receives camera frames and mic audio from the teammate's Gen 1 Ray-Ban Meta glasses and forwards them to the backend.

- Camera frames come through the toolkit; mic and speakers use Bluetooth audio profiles.
- Build against the Mock Device Kit first, then real glasses. Needs a Mac with Xcode 26.4+ and an iPhone on iOS 17.2+.
- Measure real frame rate and end-to-end latency in the first spike; a go/no-go decision gate decides glasses or fallback.
- A friend's glasses must be confirmed for testing and demo day.
- **Done when:** saying a sentence and showing an object produces a stored moment within a few seconds.

### CAP-2 Phone capture fallback

**Priority:** T0 (D-1 fallback) · **Area:** capture, dashboard

The dashboard's Capture tab posts a camera snapshot plus what was said as a `phone` moment, using the same `POST /moments` as the glasses.

- Needs HTTPS for camera and mic on iPhone Safari (Vercel URL).
- Audio starts only after a tap, so a Start button unlocks audio.
- Use a Wake Lock to keep capture running; capture stops on screen lock.
- Earbuds or phone speaker act as the audio output.
- The glasses stay in the story even when this path runs.

### CAP-3 Speech-to-text

**Priority:** T0 · **Area:** capture, backend

Streaming speech-to-text turns mic audio into transcripts, one finished utterance per moment.

- Pick one fast provider and test latency early.
- Names and companies must be accurate; rehearse with the exact demo names and offer tap-to-correct on the confirm card when misheard.
- Mark low-confidence names for correction before anything is sent.

### CAP-4 Vision captioning

**Priority:** T0 · **Area:** backend

A multimodal model writes a caption for scenes, text and objects in a snapshot.

- Run on sampled frames and on demand, not every frame.
- If latency is too high, switch to snapshot-on-demand instead of continuous vision.
- Captions are stored on the moment and used for search (for example "where did I leave my keys").

### CAP-5 Snapshot capture and cues

**Priority:** T0 · **Area:** capture

Snapshots are taken on cues rather than continuously: "remember this", picking something up and asking about it, arriving somewhere, or a tap in the app.

- A JPEG goes in `snapshot_base64` when there is something to see.
- Keep only a small snapshot set; discard raw video frames after processing.

### CAP-6 Capture state indicator

**Priority:** T0 (supports D-9) · **Area:** capture, dashboard

Capture state must always be visible and audible.

- The app header shows capturing (green), paused (amber) or off the record (red).
- A spoken cue announces state changes.
- The glasses' own recording LED stays on whenever the camera captures.

### CAP-7 Context capture

**Priority:** T0 for timestamp and place; Roadmap for screen context · **Area:** capture

Each moment carries a timestamp and place; phone context such as location feeds the place field.

- Optional screen context (what is on the user's screen) is a later addition to the same timeline.

### CAP-8 Source tagging

**Priority:** T0 · **Area:** backend

Every moment records where it came from: `glasses`, `phone`, `call` or `dashboard`, so the timeline and proof receipts can show the origin.

### CAP-9 Single ingest pipeline

**Priority:** T0 (D-1) · **Area:** backend (`memory/ingest.py`)

`POST /moments` is the only way data enters memory.

- Stores transcript, caption (vision), snapshot, embedding and timestamp.
- Links people by introduction, detects promises, and emits `moment.created` (plus `person.created`, `promise.proposed`) on the event stream.
- Returns 201 with the moment; returns 409 when capture is paused or off the record.
- Contract-tested against `contracts/`.

## 2. Shared memory and retrieval

One memory holds sight, sound and context as a single timeline. Modes change how Cortex behaves over it, never what is stored: memory is never split by mode, so a lecture heard in Student mode is findable from Life mode. Every answer is built only from retrieved moments and links back to them.

### MEM-1 Moment store

**Priority:** T0 · **Area:** backend

A moment is the atomic unit of memory: one captured utterance or snapshot.

- Fields: id (`mom_*`), timestamp, source, place, transcript, caption, snapshot, embedding, linked person ids.
- Stored in the backend database plus object storage for snapshots; embeddings stored for vector search.
- Shape defined by `contracts/schemas/moment.schema.json`; every fixture must validate against it.

### MEM-2 Memory search

**Priority:** T0 (D-2) · **Area:** backend (`memory/search.py`)

`GET /moments/search?q=` finds moments by plain-language query across audio and vision.

- Vector search merged with a freshness lookup, so the newest moments always appear even though the search index updates asynchronously.
- Returns each result with its source moment and a score.
- **Done when:** asking about something from earlier returns the right moment every time on the seeded data.

### MEM-3 Timeline listing

**Priority:** T0 (D-8) · **Area:** backend

`GET /moments` returns moments newest first, with `since` and `limit` filters, to power the dashboard timeline.

### MEM-4 People store (contact cards)

**Priority:** T0 (D-3) · **Area:** backend (`skills/network.py`)

A person is a contact card, today created by introduction or consent.

- Fields: id (`per_*`), name, company, role, topics, last seen, introduced-moment id.
- Later moments within 5 minutes of an introduction link to that person.
- `POST /people` lets the dashboard add or correct a person by hand; cards are editable and deletable.

### MEM-5 Promises store

**Priority:** T0 (D-4) · **Area:** backend (`skills/promises.py`)

A promise is a tracked commitment in either direction.

- Fields: who, what, due (stated date, or inferred and labeled as inferred, or null for vague dates), direction (`waiting_on` or `i_owe`), status, source moment id.
- Created as `proposed` (a confirm chip) and moved to its list on confirm via `POST /promises/{id}/confirm`.

### MEM-6 Ask with proof

**Priority:** T0 (D-5) · **Area:** backend (`skills/ask.py`)

`POST /ask` answers a question from memory and returns the answer, a short spoken version, a `grounded` flag, the source moments and a receipt id.

- Order of handling: "brief me on \<name>" returns the brief; questions about a known person's promises are answered straight from the promises table; everything else is search plus the model, with every citation checked against the retrieved hits.
- If nothing supports an answer, it returns `grounded: false` and says "I don't have that in memory."
- Works over three channels: `voice`, `dashboard`, `call`.
- Every answer writes a receipt of kind `answer`.
- **Done when:** a voice question gets a spoken answer and a receipt showing the source moment.

### MEM-7 Proof receipts

**Priority:** T0 · **Area:** backend (`core/receipts.py`)

A receipt is proof of something Cortex answered or did.

- Kinds: `answer`, `action`, `capture`, `deletion`.
- Carries a summary, source moment ids, an optional action id and an undo window (available, until).
- Listed newest first at `GET /receipts`.

### MEM-8 Cross-mode retrieval

**Priority:** T0 (by design) · **Area:** backend

Search and answers always read the whole memory; a promise made in Focus shows up when asked from Life.

### MEM-9 Daily digest

**Priority:** T1 (T1-3; PRD Must ship) · **Area:** backend, dashboard

An end-of-day recap of people met, tasks mentioned and follow-ups, spoken on request ("what did I do today?") and shown in the dashboard.

### MEM-10 Rewind

**Priority:** T1 (T1-3; PRD Must ship) · **Area:** backend, dashboard

"What did I promise Sarah an hour ago?" replays that transcript line with its snapshot.

### MEM-11 Lists (shopping, expenses)

**Priority:** Should (Life mode) · **Area:** backend, dashboard

Simple lists filled by voice ("add this to my shopping list", "log this receipt") and shown in the app.

### MEM-12 Retention and cascade delete

**Priority:** T0 (D-9) · **Area:** backend (`memory/delete.py`)

Keep text, embeddings and a small snapshot set only; discard raw video after processing. Deleting a moment removes everything derived from it (see PRIV-2).

## 3. Modes

A mode is a preset over the same memory. It changes what Cortex captures, what it surfaces unprompted, how it speaks, and which actions it may take. The hero flow needs no mode switch: one preset is active (the contract requires exactly one active mode at all times). A second, visibly different mode (old id T1-4) is buildable any time.

### MODE-1 Mode framework

**Priority:** T0 (contract), T1 (T1-4 for a second visible mode) · **Area:** backend, dashboard

Each mode is defined by the same fields so new modes are cheap to add.

- Fields: what it captures, when it speaks up, what it proposes, which actions are allowed, retention and privacy defaults.
- `GET /modes` returns the presets; exactly one has `active: true`. Schema in `contracts/schemas/mode.schema.json`.
- Memory is never split by mode; search always crosses modes.
- Each mode has its own retention and privacy defaults, set in the Privacy tab.

### MODE-2 Mode switching

**Priority:** T1 (with T1-4) · **Area:** backend, capture, dashboard

Three ways to switch, all confirmed audibly.

1. **Voice:** "Switch to Student mode."
2. **Auto-suggest:** calendar, location and what the camera sees suggest a mode (a lecture hall prompts Student); the user confirms with one word.
3. **Companion app:** a mode picker with per-mode settings, including which actions are allowed.

- Cortex never switches silently. A short chime and a spoken label confirm the active mode.

### MODE-3 Focus (work)

**Priority:** Should · **Persona:** professional or builder who never wants to lose a decision, promise or idea

**Captures:** meetings, decisions, whiteboards, screen context. **Speaks up:** rarely; recaps and overdue follow-ups. **Default actions:** create tasks, draft emails, add calendar events.

**All Focus features**

- **FOC-1 Auto action items:** detects commitments and to-dos in meetings and proposes them as tasks.
- **FOC-2 Meeting recap:** a spoken and on-screen summary of a meeting with decisions and follow-ups, each linked to its source moment.
- **FOC-3 Whiteboard to notes:** turns a snapshot of a whiteboard into structured notes saved to the timeline.
- **FOC-4 "What did I promise?":** answers from the I-owe list with source moments (reuses the waiting-on tracker).
- **FOC-5 Decision log:** decisions heard in meetings are saved as tagged moments so they can be found later.
- **FOC-6 Focus actions:** tasks, email drafts and calendar events, each through the action loop with confirmation rules.
- **FOC-7 Screen context:** optional capture of the user's screen during work (Roadmap).

### MODE-4 Student

**Priority:** T1 (T1-4: snapshot into flashcards is the first visible Student behavior); the rest Should · **Persona:** student capturing lectures and labs

**Captures:** lectures, slides, problem sets, lab steps. **Default actions:** make flashcards, schedule study blocks.

**All Student features**

- **STU-1 Live notes:** builds running notes from a lecture as it is heard, with timestamps linked to moments.
- **STU-2 Flashcards:** turns a snapshot, slide or notes into question and answer cards saved to Notion or Drive; the T1-4 demo behavior.
- **STU-3 Look-and-tutor:** the student looks at a problem or circuit and asks for help; Cortex explains step by step by voice.
- **STU-4 Deadline catcher:** hears a deadline ("quiz Thursday") and proposes a calendar event the student approves with one word.
- **STU-5 Study blocks:** schedules study time before a caught deadline (calendar action, needs confirmation).
- **STU-6 Cross-mode recall:** a lecture heard in Student mode is searchable from any mode.

### MODE-5 Life

**Priority:** Should · **Persona:** everyday user who wants to remember where things are and what to do next

**Captures:** snapshots on cues ("remember this", picking something up and asking, arriving somewhere), conversations the user chooses to log, receipts and errands. **Speaks up:** rarely; reminders the user set and answers they ask for.

**All Life features**

- **LIF-1 Where did I leave X:** answers from object and place moments with the snapshot as proof ("Where did I leave my keys?").
- **LIF-2 Name and context recall:** "Who was the person I met at the career fair?"; only for people the user introduced by name or who opted in.
- **LIF-3 Shopping list:** "Add this to my shopping list" appends an item; shown as a list in the app.
- **LIF-4 Receipt logging:** "Log this receipt" reads a receipt snapshot and proposes an expense entry.
- **LIF-5 Reminders:** proposes a reminder from something said (dinner plans, errands); set through tasks or phone reminders.
- **LIF-6 Message a contact:** drafts an SMS or message to a contact; always needs a spoken yes.
- **LIF-7 Life timeline:** searchable timeline with photos and map pins, plus lists (shopping, expenses).
- **LIF-8 Permissions:** messages to other people and any contact entering memory need explicit approval (introduction or consent only).

### MODE-6 Assist

**Priority:** Cut beyond a simple read-aloud; Roadmap for the rest · **Persona:** people who want assistive support, and anyone reading a label or finding an object

Assist is framed as wellness and accessibility support, not a medical device. It is a preset anyone can use. **Captures:** the scene when asked, printed text, hazards the user asks about, the user's routine.

**All Assist features**

- **AST-1 Scene description:** "What is in front of me?" returns a spoken description of the current scene; not stored unless the user saves it. A simple read-aloud is the only part allowed in the hackathon build.
- **AST-2 Sign, label and menu reading:** "Read this label" reads printed text aloud.
- **AST-3 Hazard flagging:** flags an obstacle or hazard the user asks about ("Where is the door?").
- **AST-4 Object finder:** finds a named object in view or in recent memory.
- **AST-5 Routine and medication-style reminders:** speaks reminders at times the user set; "What time is my next medicine reminder?" answers from the routine.
- **AST-6 Caregiver summary:** a daily summary sent to a caregiver the user chooses, only with explicit consent, showing exactly what will be sent, and revocable at any time.
- **AST-7 Routine view and caregiver page:** in the app, a routine view and a page showing exactly what is shared.
- **AST-8 Honest limits:** never replaces a cane, guide dog or clinician; states this in the app.

### MODE-7 Custom modes and mode SDK

**Priority:** Roadmap

User-defined presets and a third-party mode SDK so others can build modes. Not part of the hackathon build.

## 4. Skills

Skills are small, single-purpose abilities any mode can call, so a new wow moment costs a prompt and a model call, not a new architecture. Network, the waiting-on tracker and the pre-meeting brief reinforce each other and lead the demo: Network captures people and promises, the tracker holds what they owe you, and the brief brings it all back before you meet them.

### SKL-0 Skill contract

**Priority:** T0 · **Area:** backend

Every skill is written to the same contract so skills stay easy to add and easy to demo. Each must define:

- a **trigger** (voice phrase, app tap or event)
- **inputs** it reads
- **steps** it performs
- an **output** it produces
- what needs **confirmation**
- how to **undo** it
- the **source moment** it links to
- what it does **when unsure**

### SKL-1 Network (lead skill)

**Priority:** T0 (D-3) · **Area:** backend (`skills/network.py`) · **Best mode:** any

Logs a person by introduction and the promises made, then drafts the follow-up. Today people enter memory by introduction or consent.

- **Trigger:** "This is Ash from Acme", "remember this person", or an Add person tap in the app.
- **Inputs:** the name and company stated, the conversation that follows, time and place. A photo is saved only if the user takes one.
- **Steps:**
  1. Create a contact card from the introduction, linked to the moment.
  2. Listen until the user says "done" or the conversation ends.
  3. Extract topics, interests and promises made in either direction.
  4. Draft a follow-up (email or text) and show it in the app.
  5. The user edits and approves; Cortex then sends it or saves it as a draft.
- **Output:** a contact card, promises that feed the waiting-on tracker, and a follow-up draft.
- **Later use:** "Who did I meet who works on ML?" searches the cards; the pre-meeting brief reads from them.
- **Confirmation:** required before anything is sent.
- **Undo and guardrails:** cards are editable and deletable; nothing is shared with other users.
- **If unsure:** a misheard name or company is marked low confidence and shown for correction before anything is sent.
- **Done when:** "This is Ash from Acme" produces a correct card with the moment linked.

**All Network features**

- **NET-1 Introduction capture:** creates the card from the spoken introduction.
- **NET-2 Topic and interest extraction:** saves what was discussed on the card.
- **NET-3 Two-way promise extraction:** finds promises either side made and hands them to the tracker.
- **NET-4 Follow-up draft:** writes an email or text draft from the conversation.
- **NET-5 Contact search:** finds people by topic or company across cards.
- **NET-6 Manual add and correct:** the dashboard can add or fix a person (`POST /people`).
- **NET-7 Session linking:** later moments within 5 minutes link to the same person.

### SKL-2 Waiting-on tracker

**Priority:** T0 (D-4) · **Area:** backend (`skills/promises.py`) · **Best mode:** any

Tracks what other people promise you (waiting on) and what you promise them (I owe), with the source moment, and nudges when something is overdue.

- **Trigger:** someone commits in conversation ("I'll send you the deck Friday"), or the user says "I'm waiting on Sam for the quote". The user's own promises are tracked the same way as "I owe".
- **Fields:** who, what, due date (stated, or inferred and labeled as inferred), source moment, status.
- **Steps:**
  1. Detect the commitment and show a one-tap confirm chip, so false positives never clutter the list.
  2. Track it under Waiting on or I owe.
  3. At the due date, nudge by voice and in the app.
  4. Offer a drafted follow-up to the person.
  5. Close it when the user says "got it" or taps done.
- **Nudge policy:** a daily cap and quiet hours, so it stays useful instead of nagging.
- **If unsure:** an ambiguous date ("next week sometime") becomes a question, not a guessed deadline; the due date stays null.
- **Done when:** a spoken promise becomes a tracked item with who, what and due date.

**All tracker features**

- **WAI-1 Promise detection:** finds commitments in either direction.
- **WAI-2 Confirm chip:** one tap moves a `proposed` promise to its list (`POST /promises/{id}/confirm`).
- **WAI-3 Waiting on and I owe lists:** two lists with who, what, due and source.
- **WAI-4 Due-date handling:** stated dates parsed; inferred dates labeled; vague dates left null.
- **WAI-5 Overdue nudges:** voice and app nudges with a daily cap and quiet hours (T1 and later).
- **WAI-6 Follow-up draft offer:** proposes the follow-up email when a promise is confirmed or overdue (feeds the action loop, D-7).
- **WAI-7 Close out:** "got it" or a done tap closes the item.

### SKL-3 Pre-meeting brief

**Priority:** T0 (D-6) · **Area:** backend (`skills/brief.py`) · **Best mode:** Focus

A 20-second spoken summary of past conversations, interests and open promises for a person or event.

- **Trigger:** about 10 minutes before a calendar event with named attendees, or the user says "Brief me on Ash".
- **Inputs:** the calendar event, the contact card, past moments with that person, and open promises in both directions.
- **Output:** a spoken brief of about 20 seconds (who they are, last topics, what is open) plus an app card with three bullets and links to the source moments.
- **Example:** "Ash, Acme. You met at the career fair and talked about ML infra. Ash promised to send an intro; it is 5 days overdue."
- **If unsure:** with no history it says there is nothing on file rather than guessing.
- **Done when:** "Brief me on Ash" returns a correct 20-second brief from stored data.

**All brief features**

- **BRF-1 On-request brief:** `GET /people/{id}/brief` and "Brief me on \<name>" through `/ask`.
- **BRF-2 Model-written from stored data only:** the model sees only the card, moments and promises.
- **BRF-3 Template fallback:** a template from the same data is used if the model output is unusable, so the brief never fails on stage.
- **BRF-4 Caching and pre-warming:** cached until the person's data changes; `warm_all()` precomputes before going on stage.
- **BRF-5 Three bullets and sources:** up to three bullets and up to five source moments.
- **BRF-6 Automatic pre-calendar brief:** triggers about 10 minutes before an event (Should; needs calendar).
- **BRF-7 Brief by outbound call:** the brief arrives as a call (T1-2).

### SKL-4 Ask the world

**Priority:** Cut (stays out unless it comes free from memory search) · **Best mode:** Life

A short spoken answer to "What is this?" for a plant, product or error screen, or "Is this a good price?", saved with the moment. No confirmation. Overlaps Meta AI, so keep it light.

### SKL-5 Live translation

**Priority:** Cut · **Best mode:** Life

Hear a foreign phrase and get the translation in your ear. No confirmation. Medium demo risk from latency; overlaps Meta AI.

### SKL-6 Language immersion

**Priority:** Cut · **Best mode:** Student

"Name things in Spanish" names objects the user looks at in the target language and quizzes them later. No confirmation.

### SKL-7 Proactive nudge

**Priority:** Cut · **Best mode:** any

When the user looks at the same confusing thing for a while, Cortex offers help; it is an offer, not an action, and always asks first. Off by default because false triggers are the risk.

### SKL-8 Cooking or repair coach

**Priority:** Cut (cut first) · **Best mode:** Life

"Coach me through this" gives hands-free step guidance and flags mistakes. Needs reliable vision, so highest demo risk.

## 5. Action loop and integrations

Cortex does not stop at remembering: every commitment it hears becomes a proposed action the user approves in one word. Start with the follow-up email only; each added action multiplies demo risk.

### ACT-1 The five-step loop

**Priority:** T0 (D-7, one action) · **Area:** backend (`actions/followup.py`)

1. **Notice:** detect a commitment, deadline, question or need in what was seen or said ("I'll send you the slides Friday").
2. **Propose:** turn it into a concrete action with details filled in, spoken in one short sentence.
3. **Confirm:** the user says "yes", "edit" or "skip". Anything that leaves the device or spends money always needs a yes.
4. **Do:** execute through the integration and log it.
5. **Prove:** attach the source moment (timestamp, snapshot, transcript line) to the action, visible in the dashboard.

### ACT-2 Follow-up email

**Priority:** T0 (D-7) · **Area:** backend (`actions/followup.py`, `actions/email.py`)

The one action on the demo checklist. After a promise is confirmed, Cortex proposes a follow-up email to that person with its source moments.

- `POST /actions/propose` with type `follow_up_email`, a person id and source moment ids creates a proposed action; `action.proposed` is emitted.
- `POST /actions/{id}/confirm` with `deliver: send` or `draft`, and optional user edits to to, subject and body, completes it and writes a receipt.
- Sending is held until the undo window (30 seconds) closes; `POST /actions/{id}/undo` cancels it while the window is open.
- Delivery modes: dry run (saves a draft), SMTP, or Resend. `EMAIL_DRY_RUN=true` is the safe default for rehearsal.
- Gmail integration: draft needs no confirmation; send needs a yes.
- **Done when:** propose, confirm, send (or save draft), then a receipt with undo.

### ACT-3 Action states

**Priority:** T0 · **Area:** backend

Every action has one status: `proposed`, `sent`, `draft_saved`, `undone`, `dismissed` or `failed`. `GET /actions` lists them and filters by status.

### ACT-4 Confirmation policy

**Priority:** T0 · **Area:** backend

Anything that sends, spends or shares needs a spoken or tapped yes. Every action is logged and undoable. The policy per action:

| Action | Integration | Needs confirmation |
| --- | --- | --- |
| Create task or reminder | Google Tasks or Todoist, phone reminders | No, shown in recap |
| Add calendar event | Google Calendar | Yes |
| Draft or send email | Gmail | Yes for send, no for draft |
| Save notes and flashcards | Notion or Google Drive | No |
| Log expense from receipt | Spreadsheet or app | No |
| Message a contact | SMS or messaging | Yes |

### ACT-5 Calendar event

**Priority:** Should (PRD Must ship, not in a plan tier) · **Area:** backend

Adds an event through Google Calendar, for example a quiz caught by the deadline catcher. Needs confirmation. Open question: the plan left it off the demo; with tiers gone it is buildable now, and it is now built.

### ACT-6 Task or reminder

**Priority:** Should (PRD Must ship, not in a plan tier) · **Area:** backend

Creates a task or reminder in Google Tasks, Todoist or phone reminders. No confirmation; shown in the recap.

### ACT-7 Notes and flashcards

**Priority:** T1 for the flashcard demo (T1-4), otherwise Should · **Area:** backend

Saves notes and flashcards to Notion or Google Drive. No confirmation.

### ACT-8 Expense log

**Priority:** Should (Life) · **Area:** backend

Reads a receipt snapshot and logs an entry to a spreadsheet or app. No confirmation.

### ACT-9 Message a contact

**Priority:** Should (Life) · **Area:** backend

Sends an SMS or message to a contact. Always needs a yes. Outbound texts reach only phones verified for the project.

### ACT-10 Caregiver summary

**Priority:** Roadmap (Assist) · **Area:** backend

Sends a daily summary to a chosen contact. Needs explicit consent, shows exactly what will be sent, and is revocable.

### ACT-11 Skip and dismiss

**Priority:** T0 · **Area:** backend, dashboard

The user can say "skip" or tap dismiss on any proposal; the action becomes `dismissed` and is logged.

### ACT-12 Receipts and undo

**Priority:** T0 (D-7) · **Area:** backend, dashboard

Every completed action returns a receipt (`ActionResult` carries the action and its receipt) showing the source moments and an undo while the window is open. Undo returns 409 once the window has closed.

## 6. Voice interaction and audio output

Gen 1 glasses have no display, so output is audio plus the dashboard. Voice is the main way the wearer talks to Cortex.

### VOI-1 Spoken questions

**Priority:** T0 (D-5) · **Area:** capture, backend

A voice question goes to `POST /ask` with `channel: voice`; the capture app posts one finished utterance per request. Examples: "What did Ash promise me?", "Brief me on Ash", "Where did I leave my keys?".

### VOI-2 Spoken answers

**Priority:** T0 · **Area:** capture, backend

Every answer has a short `spoken` version for text-to-speech and a fuller `answer` for the screen. A brief runs about 20 seconds when spoken. The dashboard can also speak an answer aloud.

### VOI-3 Spoken confirmation

**Priority:** T0 · **Area:** capture, backend

Proposals are spoken in one short sentence and the user replies "yes", "edit" or "skip". Anything that sends, spends or shares needs a yes.

### VOI-4 Voice commands

**Priority:** T0 for capture and privacy commands; T1 for mode switching · **Area:** capture, backend

- Introductions and notes: "This is Ash from Acme", "remember this", "done".
- Privacy: pause, off the record, and "forget the last hour" or "forget everything about Sam".
- Modes: "Switch to Student mode".
- Lists and logs: "Add this to my shopping list", "Log this receipt".

### VOI-5 Audio output path

**Priority:** T0 · **Area:** capture

The glasses' speakers play audio over Bluetooth audio profiles. With the phone fallback, earbuds or the phone speaker are used.

### VOI-6 Spoken cues

**Priority:** T0 · **Area:** capture

Short spoken cues and chimes for capture state, active mode and pause.

### VOI-7 Latency budget

**Priority:** T0 · **Area:** all

Speech, vision and answers must feel live. Test early, cache the brief and the Ash answers before stage, and fall back to snapshot-on-demand if vision is slow.

## 7. Call layer (Chert and LiveKit)

Chert bridges a FaceTime call into a LiveKit room that our own agent joins, so the same backend that serves the glasses answers calls, sees the caller's camera and can show video back. The agent calls the same backend functions the glasses use: ingest a moment, answer a question, brief on a person, propose or confirm an action. Fresh use of video is weighted double in the Chert track, so the caller camera is not optional.

### CALL-1 Inbound call answered from memory

**Priority:** T0 (D-10) · **Area:** call (@ahnafzabir-utd)

A FaceTime call from an iPhone reaches Cortex, which greets in time and answers from memory.

- Greeting must come within 10 seconds of the bridge being ready, or the call ends.
- Answers use `POST /ask` with `channel: call`, with the same grounded-only rule.
- Calls cap at 5 minutes and a line serves one call at a time, so the call beat must fit in one call (about 60 seconds in the script).
- The agent process and the Chert connector must both stay running; a laptop hosts the demo.
- Current state (Nov 14): inbound call, greeting on bridge ready and caller camera to the model work on real calls; not yet answering from Cortex memory or saving moments.

### CALL-2 Caller camera into memory

**Priority:** T0 (D-10) · **Area:** call, backend

The caller holds up one object or document (a business card or whiteboard); Cortex saves what the camera shows as a moment with source `call`.

- Check Chert's video guide first for how caller frames reach our code.
- **Done when:** an iPhone FaceTime reaches Cortex, which greets in time, answers from memory and saves what the camera shows.

### CALL-3 Call events to the dashboard

**Priority:** T0 (D-8, D-10) · **Area:** call, dashboard

`call.started` and `call.ended` events appear on the live event stream so judges see the call on the dashboard.

### CALL-4 Agent video back

**Priority:** T1 (T1-1) · **Area:** call

The agent publishes video back on the call showing the proof receipt or briefing. Fallback: an iMessage attachment with the proof card, or show it on the dashboard.

### CALL-5 Outbound call for a brief

**Priority:** T1 (T1-2) · **Area:** call

Cortex rings the demo phone for a pre-meeting brief or an overdue promise. Outbound calls and texts reach only phones verified for the project (an iMessage code sent from that iPhone), so we cannot cold-call a judge; verify the demo phone in advance or have the judge call in.

### CALL-6 Persona and framing

**Priority:** T1 (T1-5) · **Area:** call

A consistent voice and look on calls.

### CALL-7 Call approvals and call-in from any iPhone

**Priority:** Roadmap · **Area:** call

Be rung for approvals, or call Cortex from any iPhone, using the same confirm rules as the glasses.

### CALL-8 Call operations

**Priority:** T0 · **Area:** call, infra

- A LiveKit project of our own for the agent.
- A teammate's iPhone confirmed for the iMessage verification code.
- Do not start the Chert trial early: confirm how the track's free line is issued (the plan says 48 hours, the PRD says 50 FaceTime minutes) and whether the trial clock has already started.
- A second verified phone and a recorded call video as fallbacks.

## 8. Companion app and dashboard

The glasses have no screen, so the companion app is where memory becomes visible and trustworthy. It ships as a phone-first web app (iPhone Safari first) that the wearer uses and that judges see on a laptop. Stack as accepted in ADR 0005: Next.js 16 with TypeScript, Tailwind CSS 4, a same-origin `/api` proxy to the backend, and Vercel hosting (HTTPS is required for iPhone camera and mic). The demo checklist covers the Live, Timeline, Ask and Receipts tabs plus privacy controls (D-8, D-9); updates must appear within seconds while the demo runs.

### DASH-1 App shell

**Priority:** T0 (D-8) · **Area:** dashboard

- Sticky header with the app name, the capture state dot (green capturing, amber paused, red off the record) and a live or offline connection indicator.
- A bottom tab bar (Live, Capture, Timeline, Ask, Receipts, Privacy; Modes added later) with safe-area padding for iPhone.
- Shows API errors and action errors in a visible banner instead of failing silently.

### DASH-2 Live tab

**Priority:** T0 (D-3, D-4, D-6, D-8) · **Area:** dashboard

The screen judges watch during the demo.

- A live activity feed driven by the event stream.
- New contact cards appear with their source moment ("This is Ash from Acme").
- Promise confirm chips appear and move to Waiting on or I owe on one tap.
- Proposed actions (the follow-up email) appear for approval with edit, send, draft and skip.
- The spoken brief for a person is shown as three bullets with source links.
- Current capture state is visible at all times.

### DASH-3 Capture tab

**Priority:** T0 (D-1 fallback) · **Area:** dashboard

Phone capture: a camera snapshot plus what was said, posted as a `phone` moment. Includes a Start button that unlocks audio and a Wake Lock to keep capture running.

### DASH-4 Timeline tab

**Priority:** T0 (D-8, D-9) · **Area:** dashboard

- Moments newest first with transcript, caption, snapshot, people and time.
- Delete any moment; deleting also removes promises found in it.
- Photos and map pins are a later addition (Life mode).

### DASH-5 Ask tab

**Priority:** T0 (D-5) · **Area:** dashboard

- A text box and suggestion chips ("Where did I leave my keys?", "What is open with Ash?").
- Shows the answer, a Speak button, the exact source moments (snapshot and transcript line) and the receipt id.
- When nothing supports an answer it shows the "I don't have that" response, not a guess.

### DASH-6 Proof receipts tab

**Priority:** T0 (D-7, D-8) · **Area:** dashboard

- Receipts newest first with kind, time, summary and the number of source moments.
- An Undo button with a live deadline while the undo window is open.
- Tapping a receipt opens its source moments.

### DASH-7 Privacy tab

**Priority:** T0 (D-9) · **Area:** dashboard

Three states: capturing, paused (nothing captured until resumed) and off the record (nothing stored, even if heard). A pointer to deleting moments from the Timeline. Later: per-mode retention defaults, forget by time range, and a caregiver sharing page.

### DASH-8 People and promises views

**Priority:** T0 (shown in Live) · **Area:** dashboard

Contact cards with topics, company and linked moments; Waiting on and I owe lists with who, what, due and source. Search by topic or company.

### DASH-9 Live event stream

**Priority:** T0 (D-8) · **Area:** dashboard, backend

The app subscribes to `GET /events` (server-sent events) and refreshes on `moment.created`, `moment.deleted`, `person.created`, `promise.proposed`, `promise.confirmed`, `action.proposed`, `action.updated`, `receipt.created`, `privacy.changed`, `call.started` and `call.ended`.

### DASH-10 Modes tab

**Priority:** T1 (with T1-4) · **Area:** dashboard

Mode picker, active mode, and per-mode settings including which actions are allowed.

### DASH-11 Digest and rewind views

**Priority:** T1 (T1-3) · **Area:** dashboard

A daily digest card and a rewind view that replays a transcript line with its snapshot.

### DASH-12 Lists and routine views

**Priority:** Should (lists) and Roadmap (routine, caregiver) · **Area:** dashboard

Shopping and expense lists for Life mode; a routine view and caregiver page for Assist.

### DASH-13 Mock backend and demo driver

**Priority:** Tooling (works today) · **Area:** dashboard

A stateful mock server lets the dashboard be built and rehearsed before the real backend is ready. A Demo driver card on the Live tab steps through the Ash script (Meet, Promise, confirm, Ask, Brief, Act, FaceTime), with Next step, Play all and Reset. The mock must never grow into the real backend; its extras (`/_demo/*`, the `demo.step` event) are mock-only.

## 9. Trust, privacy and safety

Always-on cameras are the first objection judges and the public raise, so privacy is a product feature, not a footnote. The demo checklist includes the minimums (D-9), which must work on stage and be visible to judges.

### PRIV-1 Pause and off the record

**Priority:** T0 (D-9) · **Area:** backend, dashboard, capture

`GET /privacy` and `POST /privacy/pause` switch between `capturing`, `paused` and `off_record`. While paused or off the record, `POST /moments` returns 409 and nothing is stored. A `privacy.changed` event updates the dashboard immediately.

### PRIV-2 Delete a moment, with cascade

**Priority:** T0 (D-9) · **Area:** backend (`memory/delete.py`)

`DELETE /moments/{id}` removes the moment, its embedding, snapshot, derived promises, any people it introduced and its database rows, and returns a `deletion` receipt. A `moment.deleted` event is emitted.

### PRIV-3 Forget by time range or person

**Priority:** Should · **Area:** backend, capture

"Forget the last hour" and "forget everything about Sam" delete matching moments, embeddings and derived notes. Runs live in the PRD demo close.

### PRIV-4 Face recognition (no longer a rule)

**Priority:** Cut, now buildable · **Area:** all

The no-face-recognition rule was removed (2026-11-15). Face and voice identification are now ordinary features that can be built. Today's code does not identify anyone by face or voice.

### PRIV-5 How people enter memory (no longer a rule)

**Priority:** Should · **Area:** backend

The introduction-or-consent rule was removed (2026-11-15). Today the Network skill adds people from introductions and explicit adds; other ways in can be built. Nothing is shared with other users.

### PRIV-6 Visible capture state

**Priority:** T0 · **Area:** capture, dashboard

The app and a spoken cue always say whether capture is on; the glasses' recording LED stays on whenever the camera captures (see CAP-6).

### PRIV-7 Minimal retention

**Priority:** T0 · **Area:** backend

Keep text, embeddings and a small snapshot set; discard raw video frames after processing. Per-mode retention defaults are set in the Privacy tab.

### PRIV-8 Action safety

**Priority:** T0 · **Area:** backend

Anything that sends, spends or shares needs a spoken or tapped yes. Every action is logged with a receipt and is undoable while the window is open.

### PRIV-9 Grounded answers only

**Priority:** T0 (D-5) · **Area:** backend

Answers come only from retrieved moments, with citations checked against the hits. If memory has nothing, Cortex says "I don't have that" instead of guessing, so errors stay visible and correctable.

### PRIV-10 Correctable captures

**Priority:** T0 · **Area:** backend, dashboard

Misheard names are marked low confidence and can be corrected by tap before anything is sent. Contact cards are editable and deletable.

### PRIV-11 Caregiver consent

**Priority:** Roadmap · **Area:** backend, dashboard

Caregiver summaries need explicit consent, show what will be sent, and can be revoked at any time.

### PRIV-12 Local-first processing

**Priority:** Roadmap · **Area:** capture

Run lightweight detection on the phone and send only what a query needs to cloud models; on-device processing for privacy-sensitive steps comes later.

### PRIV-13 Honest limits

**Priority:** T0 (messaging) · **Area:** all

Cortex is an assistive and productivity aid, not a medical or safety-critical device, and never replaces a cane, guide dog or clinician.

### PRIV-14 Demo data consent

**Priority:** T0 · **Area:** demo

The demo uses only teammates' data, with their consent obtained first.

## 10. Platform

The shared foundation every area builds on. The contract folder is the single source of truth between capture, backend, dashboard and call agent.

### PLAT-1 API contracts

**Priority:** T0 · **Area:** contracts (@ClosetCoderSad)

`contracts/openapi.yaml` plus JSON Schemas for Moment, Person, Promise, Action, Receipt and Mode. Changes need an issue labeled `contract-change` that lists affected areas; prefer additive changes; fixtures and examples are updated in the same push.

| Endpoint | Purpose | Demo checklist |
| --- | --- | --- |
| `POST /moments` | Ingest from glasses, phone, call or dashboard | D-1 |
| `GET /moments`, `GET /moments/search?q=` | Timeline and search, with source moments | D-2, D-8 |
| `POST /people`, `GET /people`, `GET /people/{id}/brief` | Contact cards and the spoken brief | D-3, D-6 |
| `POST /promises`, `POST /promises/{id}/confirm`, `GET /promises` | Waiting on and I owe | D-4 |
| `POST /ask` | Answer, sources and receipt id | D-5, D-10 |
| `GET /actions`, `POST /actions/propose`, `/actions/{id}/confirm`, `/actions/{id}/undo`, `GET /receipts` | Follow-up email loop | D-7 |
| `GET /privacy`, `POST /privacy/pause`, `DELETE /moments/{id}` | Pause, off the record, delete | D-9 |
| `GET /events` | Live updates for the dashboard | D-8 |
| `GET /modes`, `GET /health` | Mode presets, liveness | none |

### PLAT-2 Backend service

**Priority:** T0 · **Area:** backend (@ClosetCoderSad)

A backend that implements every contract operation with the same paths, bodies and response shapes.

- Layout: `api/` routes and models, `memory/` ingest, search, store and delete, `skills/` network, promises, brief and ask, `actions/` follow-up and email, `core/` config, database, model client, events, receipts and snapshots.
- Every response is validated against `contracts/` in tests.
- Loads `fixtures/` at startup because memory is in-process until persistence lands (`SEED_ON_START=false` to skip).

### PLAT-3 Model and storage layer

**Priority:** T0 · **Area:** backend

A model client behind one interface with a rule-based mock for offline tests; vector search over stored moments; object storage for snapshots. The stack is not locked: the PRD names Postgres with pgvector, Next.js, native Swift or Kotlin, and AWS, and these remain options in ADRs 0001 to 0004 (all Proposed).

### PLAT-4 Live event broker

**Priority:** T0 (D-8) · **Area:** backend

A server-sent events stream at `GET /events` carrying the event types listed under DASH-9, so every area sees changes within seconds.

### PLAT-5 Hosting

**Priority:** T0 · **Area:** infra (@ashzaeen)

A single cloud backend, pre-warmed before demo day; the dashboard on Vercel for HTTPS on iPhone; the call agent and Chert connector on a laptop that stays running.

### PLAT-6 Status board and issue workflow

**Priority:** T0 · **Area:** infra

`docs/STATUS.md` tracks each demo checklist item as not started, in progress, works or broken, with last verified `YYYY-MM-DD @handle`; `make check` rejects a `works` row with no verification. Task issues carry a demo checklist id when they deliver one, a done-when test and verification steps.

### PLAT-7 Tooling and CI

**Priority:** T0 · **Area:** infra

`make check` validates contracts and fixtures and runs on every push to `main` in CI. Direct pushes to `main` are allowed; force pushes and branch deletion are blocked; run `make check` after `git pull` and before `git push`. A mock API from the contract (`make dev`) lets every area build before the backend exists.

### PLAT-8 Ownership and areas

**Priority:** T0 · **Area:** infra

CODEOWNERS and area labels: contracts and backend (@ClosetCoderSad), dashboard, demo and infra (@ashzaeen), capture (@794KHSameer, iOS app @ahnafzabir-utd), call agent (@ahnafzabir-utd). Each area stays in its own folder and requests changes elsewhere through issues.

## 11. Demo readiness and reliability

The goal is to win the HackUTA 2026 main track and the Chert Best Use of FaceTime track with one flawless 3-minute demo. Demo reliability is itself a demo checklist item (D-11): the full script must run start to finish without touching code, twice in a row.

### DEMO-1 Hero demo script (frozen)

**Priority:** T0 (D-11) · **Area:** demo (@ashzaeen) · **Source:** `docs/DEMO_SCRIPT.md`

One continuous story where a promise made in conversation comes back later, with proof, on a video call. Changing it needs an issue labeled `area:demo` agreed by the whole team.

| # | Beat | Time | What happens | Checklist ids |
| --- | --- | --- | --- | --- |
| 1 | Meet | 20 s | Wearing the glasses, say "This is Ash from Acme." A contact card appears on the live dashboard with the moment attached. | D-1, D-3, D-8 |
| 2 | Promise | 20 s | Ash says "I'll send you the deck Friday." A confirm chip appears; one tap adds it to Waiting on, with the source moment. | D-4, D-8 |
| 3 | Ask with proof | 30 s | Ask "What did Ash promise me?" Cortex answers by voice and opens a proof receipt with the exact moment. | D-2, D-5 |
| 4 | Brief | 20 s | "Brief me on Ash." Cortex speaks a 20-second brief. | D-6 |
| 5 | Act | 30 s | Cortex proposes a follow-up email; approve it; it sends and a receipt with undo appears. | D-7 |
| 6 | Call finale | 60 s | FaceTime Cortex from an iPhone, hold up a business card or whiteboard, then ask "What is open with Ash?" Cortex answers from memory, with the proof card on video if video back works. | D-10 |

Privacy (pause or off the record, delete a moment) is also shown on stage (D-9).

### DEMO-2 Seeded data and fixtures

**Priority:** T0 (D-11) · **Area:** demo (`fixtures/`, `make seed`)

Memory is seeded with a few earlier days of data so recall across time is real. Fixtures seed earlier days with other people only; Ash is created live. The demo owner decides whether to seed earlier Ash moments. Fixtures validate against the contract schemas.

### DEMO-3 Pre-warm and cache

**Priority:** T0 · **Area:** demo, backend

Before going on stage, pre-warm the brief (`warm_all()`) and pre-compute and cache the Ash answers so slow models cannot stall the demo.

### DEMO-4 Backup video

**Priority:** T0 (D-11) · **Area:** demo

A recorded backup video of the full demo, kept on the laptop, including the call.

### DEMO-5 Fallback plan

**Priority:** T0 · **Area:** demo

| If this fails | Switch to |
| --- | --- |
| Glasses camera or mic path | Phone camera and mic through the same pipeline; glasses stay in the story |
| Chert call will not connect | Retry on a second verified phone; if still down, play the recorded call video and say so |
| Agent video back | iMessage attachment with the proof card, or show it on the dashboard |
| Venue wifi | Phone hotspot, with seeded data cached locally |
| Speech misheard (names) | Tap to correct on the confirm card; rehearse with the exact names |
| Slow answers | Cached brief and Ash answers |
| Live person unavailable to play Ash | A teammate plays Ash from a fixed script |

### DEMO-6 Go/no-go checks (first)

**Priority:** T0 (M0 spikes) · **Area:** all

Run before building anything else; switch to the fallback the same day if one fails.

- [ ] Gen 1 glasses: the toolkit runs and delivers camera frames to our app
- [ ] Capture latency and frame rate are good enough for a live demo
- [ ] A friend's glasses confirmed for demo day and testing
- [ ] A teammate with an iPhone confirmed to send the Chert verification code
- [ ] How the track's free Chert line is issued and when it starts
- [ ] Chert's video guide read: how caller frames reach our code
- [ ] A LiveKit project of our own created
- [ ] A greeting within 10 seconds of bridge ready works in a test call
- [ ] Demo phone verified for outbound calls and texts
- [ ] Chert track selected on Devpost and hardware track rules read

### DEMO-7 Rehearsal and freeze

**Priority:** T0 · **Area:** demo

- Feature freeze at least 6 hours before judging; after it, only bug fixes and rehearsal.
- At least 10 full rehearsals after freeze (the PRD says 5; the plan's 10 applies).
- No tier gating: other work can continue alongside rehearsal, until the feature freeze.

### DEMO-8 Pitch and submission

**Priority:** T0 · **Area:** demo (@ashzaeen)

- A two-sentence answer to "Why not just Meta AI?": Meta AI answers about what you see right now; Cortex remembers across days, shows which moment an answer came from, and follows through with actions you approve.
- Prepared answers for "Isn't this Bee or Limitless?", "Won't Meta build this?", "What about privacy?" and "How accurate is retrieval?".
- The Devpost writeup, the Chert track submission, and a roadmap slide for the cut items.

## Roadmap and cut list

These are not built for the hackathon. Mention them on the roadmap slide in the pitch, not in the demo.

**Cut for the hackathon**

| Item | Why it is cut |
| --- | --- |
| Face recognition and contact memory | No longer cut (2026-11-15): buildable any time |
| Memory graph, car mode, smart tags, ambient hub | Not on the hero path |
| Multi-user sharing and caregiver dashboards | Needs consent and account model |
| Whisper coach | Ethics risk in interviews and negotiations |
| Live translation, language immersion | Overlap Meta AI; latency risk |
| Proactive nudge | False triggers; always asks first |
| Cooking or repair coach | Needs reliable vision; cut first |
| Assist beyond a simple read-aloud | Larger scope than the demo needs |
| Ask the world | Stays out unless it comes free from memory search |

**After the hackathon**

1. Calibrate retrieval accuracy and cost with real daily use.
2. On-device processing for privacy-sensitive steps.
3. Third-party mode SDK so others can build modes, plus custom user-defined modes.
4. Support for display glasses and other hardware.
5. Open memory API so other agents can query a user's memory with permission.

## Appendix: demo checklist traceability and open questions

**Where each demo checklist item is delivered**

| Id | Must work | Delivered by | Done when |
| --- | --- | --- | --- |
| D-1 | Capture to backend | CAP-1 to CAP-9, DASH-3 | A sentence plus an object produces a stored moment in seconds |
| D-2 | Memory search returns the source moment | MEM-1, MEM-2 | The right moment returns every time on seeded data |
| D-3 | Introduction creates a contact card | SKL-1, MEM-4 | "This is Ash from Acme" gives a correct card with the moment linked |
| D-4 | Waiting-on tracker with one-tap confirm | SKL-2, MEM-5, DASH-2 | A spoken promise becomes a tracked item with who, what, due |
| D-5 | Ask with a proof receipt | MEM-6, MEM-7, VOI-1, DASH-5 | A voice question gets a spoken answer and a receipt with the source moment |
| D-6 | Pre-meeting brief, spoken | SKL-3 | "Brief me on Ash" returns a correct 20-second brief |
| D-7 | Follow-up email with undo | ACT-1 to ACT-4, ACT-12, DASH-6 | Propose, confirm, send or draft, then a receipt with undo |
| D-8 | Live dashboard | DASH-1 to DASH-9, PLAT-4 | Updates appear within seconds during the demo |
| D-9 | Pause or off the record, delete a moment | PRIV-1, PRIV-2, DASH-7 | Both work on stage and are visible to judges |
| D-10 | Chert inbound call answered from memory, with caller camera | CALL-1 to CALL-3, CALL-8 | An iPhone FaceTime reaches Cortex, which greets in 10 s, answers and saves the camera view |
| D-11 | Demo reliability | DEMO-1 to DEMO-8 | The full script runs twice in a row without touching code |

**Former Tier 1 items (no longer ordered or gated):** T1-1 agent video back (CALL-4), T1-2 outbound call for a brief (CALL-5, BRF-7), T1-3 daily digest and rewind (MEM-9, MEM-10, DASH-11), T1-4 a second visible mode (MODE-1, MODE-2, MODE-4, STU-2, DASH-10), T1-5 persona on calls (CALL-6).

**Open questions for the team**

- [ ] Calendar and task actions (ACT-5, ACT-6) are PRD Must ship but not in any plan tier. With tiers gone they are buildable now (ACT-5 and ACT-6 are built).
- [ ] Chert trial: the plan says a free 48-hour line, the PRD says 50 FaceTime minutes. Which applies, and has the clock already started from the earlier onboarding?
- [ ] Who has the Mac with Xcode 26.4+, and whose iPhone (iOS 17.2+) runs the capture app? Ashzaeen has no iPhone.
- [ ] Which teammate's iPhone sends the Chert verification code?
- [ ] Stack decisions in ADRs 0001 to 0004 are still Proposed; who accepts them and when?
- [ ] Should the demo seed earlier Ash moments, or create Ash only live?
- [ ] Which one extra skill or mode is chosen for the demo after rehearsal (the PRD asks for one more by reliability)?
- [ ] The PRD demo (Student, Life, Assist beats) differs from the frozen plan demo; confirm the plan version is final.
