# Project Cortex - Product Concept for HackUTA 2026

Nov 14, 2026 · @Ashzaeen

## Vision

**Cortex is a second brain you wear: it remembers what you see and hear, adapts to what you are doing, and follows through on its own, with proof for every answer.** Working name; swap it freely.

Today's AI memory devices mostly record and summarize. Audio-only pendants miss everything visual, and glasses assistants answer in the moment but rarely close the loop. Cortex joins the three halves of the problem:

- **One memory:** a single timeline of sight, sound, screen and context, searchable in plain language.
- **Many modes:** the same memory behaves differently for a student, a worker, a person at home, or someone who needs assistive support.
- **Action with proof:** it proposes and executes follow-through (tasks, emails, reminders), and every answer links to the exact moment that supports it.

Tagline for judges: **"Other devices remember. Cortex remembers, acts, and shows its proof."**

## Product summary

Cortex is a second brain that remembers what you see and hear through Ray-Ban Meta glasses, answers from that memory with proof, and takes follow-up actions for you. It is built for students, professionals, everyday users and assistive users alike. Everything we plan to build:

- **Capture:** the glasses' camera and mics, phone context and optional screen context feed one shared memory timeline of transcripts, captions, snapshots, time and place.
- **Modes:** Focus, Student, Life and Assist are presets (what to capture, when to speak, what to propose) over that one memory, switched by voice or app.
- **Skills:** Network, waiting-on tracker and pre-meeting brief lead; daily digest and rewind are core memory features; ask the world, translation, language immersion, proactive nudge and a coach come after the core works.
- **Action loop:** Cortex notices, proposes, asks you to confirm, does it, then shows a proof receipt with the source moment and an undo.
- **Companion app:** Live, Timeline, Ask, Proof receipts, Modes and Privacy tabs, so everything Cortex remembers or did is visible and editable.
- **Call layer:** the same brain answers and places FaceTime calls through Chert, so you can show it things on camera, get a briefing back on video, be rung for briefs and approvals, or call it from any iPhone.
- **Trust:** no face recognition, people enter memory only by introduction or consent, mode-level privacy defaults, and one-tap pause or delete.
- **Hackathon aim:** win the main track and the Chert FaceTime track with one polished demo, shipping the Must ship list first and the call layer behind it.

## Who it is for

Cortex serves four groups with one product, because each group maps to a mode rather than a separate app.

| Persona | Job they hire Cortex for | Mode |
| --- | --- | --- |
| Student | Capture lectures and labs, turn them into notes, flashcards and deadlines | Student |
| Professional or builder | Never lose a decision, promise or idea; clear the follow-ups automatically | Focus |
| Everyday user | Remember where things are, who said what, what to buy, what to do next | Life |
| Person needing assistive support (low vision, memory or routine support) | Hear scenes and text, find objects, get routine reminders, share a daily view with a caregiver | Assist |

Assist is framed as wellness and accessibility support, not a medical device.

## Product architecture

**Everything flows through one shared memory, so modes are presets, not separate apps.**

&#91;embedded content: Cortex architecture · 5 layers\]

Capture feeds the memory; each mode reads the same memory and chooses what to surface; actions write back with their source moment, which the companion app shows as proof.

## The modes

**A mode is a preset over the same memory:** it changes what Cortex captures, what it surfaces unprompted, how it speaks, and which actions it may take. Memory is never split by mode, so a lecture heard in Student mode is still findable from Life mode.

| Mode | Captures and surfaces | Signature features | Default actions |
| --- | --- | --- | --- |
| Focus (work) | Meetings, decisions, whiteboards, screen context | Auto action items, meeting recap, whiteboard to notes, "what did I promise?" | Create tasks, draft emails, add calendar events |
| Student | Lectures, slides, problem sets, lab steps | Live notes, flashcards, look-and-tutor on a problem or circuit, deadline catcher | Make flashcards, schedule study blocks |
| Life | Objects, places, conversations, errands | "Where did I leave X?", name and context recall (opt-in contacts), receipt logging, shopping list | Set reminders, log expenses, message a contact |
| Assist | Scene, text, hazards, routine | Spoken scene and sign reading, object finder, routine and medication-style reminders, caregiver summary with consent | Read aloud, remind, send a daily summary to a chosen contact |

**How switching works**

1. **Voice:** "Switch to Student mode."
2. **Auto-suggest:** calendar, location and what the camera sees suggest a mode (a lecture hall prompts Student); the user confirms with one word.
3. **Companion app:** a mode picker and per-mode settings, including which actions are allowed.

Every mode shares four guarantees: a visible capture state, a "forget" command, a proof link on every answer, and confirmation before any action that leaves the device.

### Mode details

Every mode is a preset of the same six settings over one shared memory: what it captures, when it speaks, what it proposes, what it saves, what it asks permission for, and what it shows in the app. Capture rules below are proposed defaults, and continuous capture on Gen 1 glasses (battery, heat, camera limits) is still to be verified, so capture is cue-based by default.

**Focus (work)**

- **Captures:** meeting audio as a transcript, whiteboard and slide snapshots, calendar context, optional screen context.
- **Speaks up:** only on request or at set cues, such as meeting end ("3 action items, want them as tasks?"). Silent otherwise.
- **You say:** "What did I promise Sam?", "Summarize the last 10 minutes", "Brief me on my 2pm", "Off the record."
- **Proposes:** tasks, follow-up email drafts, calendar events, each with its source moment.
- **Saves:** transcript, snapshots, action items and promises, linked to the person and project.
- **Shows in the app:** a recap card within a minute of the meeting ending, with action items to approve.
- **Permission:** sending anything, creating calendar events, and any capture after "off the record".

**Student**

- **Captures:** lecture audio, slide and board snapshots, problem sets, lab steps, syllabus and deadline mentions.
- **Speaks up:** on request; flags deadline mentions ("exam moved to Friday, add it?"); quizzes you when asked.
- **You say:** "Explain what is on this slide", "Look at this circuit and tell me what is wrong", "Make flashcards from today", "Quiz me on lecture 6."
- **Proposes:** flashcards, study blocks ahead of deadlines, a per-course notes page.
- **Saves:** notes per course, with each snapshot tied to its timestamp in the lecture.
- **Shows in the app:** an end-of-day study sheet per course with flashcards and open deadlines.
- **Permission:** adding calendar events; recording is off by default in exams and wherever a course bans it.

**Life**

- **Captures:** snapshots on cues ("remember this", picking something up and asking, arriving somewhere), conversations you choose to log, receipts and errands.
- **Speaks up:** rarely; reminders you set and answers you ask for.
- **You say:** "Where did I leave my keys?", "Who was the person I met at the career fair?", "Add this to my shopping list", "Log this receipt."
- **Proposes:** reminders, expense entries, a message to a contact.
- **Saves:** object and place moments, receipts, shopping items, people you introduced by name.
- **Shows in the app:** a searchable timeline with photos and map pins, plus lists (shopping, expenses).
- **Permission:** messages to other people, and any contact entering memory (introduction or consent only).

**Assist**

- **Captures:** the scene when asked, printed text, hazards you ask about, your routine.
- **Speaks up:** spoken scene descriptions, reading signs, labels and menus aloud, finding an object, routine reminders at set times.
- **You say:** "What is in front of me?", "Read this label", "Where is the door?", "What time is my next medicine reminder?"
- **Proposes:** a daily summary for a chosen caregiver.
- **Saves:** routine events and reminders you set; scene descriptions are not kept unless you save them.
- **Shows in the app:** a routine view and a caregiver page showing exactly what is shared.
- **Permission:** caregiver summaries need your explicit consent, show what will be sent, and can be revoked at any time.
- **Note:** Assist is a preset anyone can use (reading a label, finding an object), not a product only for assistive users.

**Rules across all modes**

- Search crosses modes: a promise made in Focus shows up when you ask from Life.
- Each mode has its own retention and privacy defaults, set in the Privacy tab.
- Switching is by voice or app, and Cortex may suggest a switch from calendar or place but never switches silently. A short chime and a spoken label confirm the active mode.
- Custom modes (user-defined presets) are a later feature, not part of the hackathon build.

## Skills library

**Skills are small, single-purpose abilities any mode can call, so a new wow moment costs a prompt and a model call, not a new architecture.** They reuse the same capture and memory.

**Core memory features (ship in the MVP)**

- **Daily digest:** an end-of-day recap of people met, tasks mentioned and follow-ups, spoken on request and shown in the dashboard.
- **Rewind:** "What did I promise Sarah an hour ago?" replays that transcript line with its snapshot.

**Skills (the first three lead the demo; add the rest once the core loop is reliable)**

| Skill | What it does | Best mode | Demo risk |
| --- | --- | --- | --- |
| Network | Say "this is Priya from Acme"; it logs the contact, topics and promises, then drafts the follow-up. No face recognition: people enter memory only by introduction or consent | Any | Low |
| Waiting-on tracker | Tracks what other people promise you, with the source moment, and nudges when something is overdue | Any | Low |
| Pre-meeting brief | A 20-second spoken summary of past conversations, interests and open promises for a person or event, on request or before a calendar event | Focus | Low |
| Ask the world | "What is this?" for a plant, product or error screen; "Is this a good price?" | Life | Low |
| Live translation | Hear a foreign phrase, get the translation in your ear | Life | Medium (latency) |
| Language immersion | Names what you look at in your target language | Student | Low |
| Proactive nudge | Offers help when you look at the same confusing thing for a while | Any | Medium (false triggers) |
| Cooking or repair coach | Watches the task, guides hands-free, flags mistakes | Life | High (needs reliable vision) |

Network, the waiting-on tracker and the pre-meeting brief reinforce each other: Network captures people and promises, the tracker holds what they owe you, and the brief brings it all back before you meet them. Pick one more skill for the demo based on reliability in rehearsal; the rest go on the roadmap slide.

### Skill details

Every skill is written to the same contract: a trigger, inputs, steps, an output, what needs confirmation, how to undo it, the source moment it links to, and what it does when it is unsure. That keeps skills easy to add and easy to demo.

**Network** (lead skill)

- **Trigger:** you say "this is Priya from Acme" or "remember this person", or tap Add person in the app.
- **Inputs:** the name and company you state, the conversation that follows, the time and place. A photo is saved only if you take one. No face recognition.
- **Steps:**
  1. Create a contact card from the introduction, linked to the moment.
  2. Listen until you say "done" or the conversation ends.
  3. Extract topics, interests and promises made in either direction.
  4. Draft a follow-up (email or text) and show it in the app.
  5. You edit and approve; Cortex then sends it or saves it as a draft.
- **Output:** a contact card, promises that feed the waiting-on tracker, and a follow-up draft.
- **Later use:** "Who did I meet who works on ML?" searches the cards; the pre-meeting brief reads from them.
- **Undo and guardrails:** cards are editable and deletable; people enter memory only by introduction or consent; nothing is shared with other users.
- **If unsure:** a misheard name or company is marked low confidence and shown for correction before anything is sent.

**Waiting-on tracker**

- **Trigger:** someone commits in conversation ("I'll send you the deck Friday"), or you say "I'm waiting on Sam for the quote". Your own promises are tracked the same way as "I owe".
- **Fields:** who, what, due date (stated, or inferred and labeled as inferred), source moment, status.
- **Steps:**
  1. Detect the commitment and show a one-tap confirm chip, so false positives never clutter the list.
  2. Track it under Waiting on or I owe.
  3. At the due date, nudge you by voice and in the app.
  4. Offer a drafted follow-up to the person.
  5. Close it when you say "got it" or tap done.
- **Nudge policy:** a daily cap and quiet hours, so it stays useful instead of nagging.
- **If unsure:** an ambiguous date ("next week sometime") becomes a question, not a guessed deadline.

**Pre-meeting brief**

- **Trigger:** about 10 minutes before a calendar event with named attendees, or you say "brief me on Priya".
- **Inputs:** the calendar event, the contact card, past moments with that person, and open promises in both directions.
- **Output:** a spoken brief of about 20 seconds (who they are, last topics, what is open between you) plus an app card with three bullets and links to the source moments.
- **Example:** "Priya, Acme. You met at the career fair on Oct 3 and talked about ML infra. She promised to send an intro to her lead; it is 5 days overdue."
- **If unsure:** with no history it says there is nothing on file rather than guessing.
- **Call layer:** can also arrive as an outbound call before the meeting.

**The remaining skills**

| Skill | Trigger | Output | Needs confirmation | Cut line |
| --- | --- | --- | --- | --- |
| Ask the world | "What is this?" plus a look at it | A short spoken answer, saved with the moment | No | Optional; overlaps Meta AI, so keep it light |
| Live translation | A foreign phrase heard | Translation in your ear | No | Optional; overlaps Meta AI, use only if time allows |
| Language immersion | "Name things in Spanish" | Objects named in the target language, quizzed later | No | After core skills |
| Proactive nudge | You look at the same confusing thing for a while | An offer of help, not an action | Yes, always asks first | Off by default; false triggers are the risk |
| Cooking or repair coach | "Coach me through this" | Hands-free step guidance with mistake flags | No | Cut first; needs reliable vision |

## Agentic follow-through

**Cortex does not stop at remembering: every commitment it hears becomes a proposed action the user can approve in one word.** The loop has five steps:

1. **Notice:** detect a commitment, deadline, question or need in what was seen or said ("I'll send you the slides Friday").
2. **Propose:** turn it into a concrete action with the details filled in, spoken in one short sentence.
3. **Confirm:** the user says "yes", "edit" or "skip". Anything that leaves the device or spends money always needs a yes.
4. **Do:** execute through integrations and log it.
5. **Prove:** attach the source moment (timestamp, snapshot, transcript line) to the action, visible in the dashboard.

| Action | Integration | Needs confirmation |
| --- | --- | --- |
| Create task or reminder | Google Tasks or Todoist, phone reminders | No, shown in recap |
| Add calendar event | Google Calendar | Yes |
| Draft or send email | Gmail | Yes (send), no (draft) |
| Save notes and flashcards | Notion or Google Drive | No |
| Log expense from receipt | Spreadsheet or app | No |
| Message a contact | SMS or messaging | Yes |

Start with calendar, tasks and email drafts only; each additional action multiplies demo risk.

## Companion app and dashboard

**The glasses have no screen, so the companion app is where the memory becomes visible and trustworthy.** It ships as a phone app (the glasses bridge) plus a web dashboard for judges and teammates.

| Screen | What it shows | Why it matters |
| --- | --- | --- |
| Live | Current mode, capture state, last heard and seen, pending action proposals | Shows the system is alive during the demo |
| Timeline | The day as scrollable moments with snapshots, transcripts and tags | Makes memory tangible |
| Ask | Text or voice question box with answers that cite moments | Core retrieval demo |
| Proof receipts | Each action with its source moment, status and undo | Builds trust and sets Cortex apart |
| Modes | Picker, per-mode permissions, allowed actions | Shows versatility |
| Privacy | Capture indicator, forget by time range or person, export, delete all | Answers the first judge question |

**Memory graph (stretch):** people, places, topics and tasks as linked nodes, so "everything about CSE 3310" is one tap.

## Call layer: Cortex over FaceTime

Cortex also answers and places FaceTime calls through Chert, so the second brain is reachable from any iPhone, with or without the glasses on. All five features below are in scope. They are channel adapters over the same backend as the glasses and dashboard, not a second product.

| Feature | What it does | Example |
| --- | --- | --- |
| Caller camera to agent | Show Cortex an object, card, whiteboard, receipt or document live; it saves it to memory or looks up what memory holds about it | Hold up a business card on a call and it logs the contact and the promise you made |
| Agent video back | During the call Cortex shows a briefing, snapshot, proof receipt or visual answer | Ask "what did I promise Sam?" and see the source moment on screen |
| Outbound calls | Cortex rings you when something needs you | Pre-meeting brief, an overdue promise, an action waiting for approval |
| Inbound calls | Call Cortex from any iPhone as an on-demand interface, and use the phone camera as a source when the glasses are off | Ask a question from the car, or show it a whiteboard |
| Persona and framing | A consistent voice and look on calls, or none | A plain voice with no avatar by default; a branded look for the demo |

**How it connects.** A Chert line bridges FaceTime into a LiveKit room, and our own agent joins that room. We control the voice, the brain and the video the agent publishes. The agent calls the same Cortex backend functions the glasses use: ingest a moment, answer a question, brief on a person, propose or confirm an action.

**Build order** (each step works on its own):

1. Inbound voice call that answers from memory.
2. Caller camera: one object or document saved to the timeline.
3. Outbound call for a pre-meeting brief or overdue promise.
4. Agent video back, with iMessage attachments as the fallback.
5. Persona and framing polish.

**Priority.** Should ship, behind the Must ship list. One strong call moment in the demo is worth more than all five half done.

**Limits to design around** (from Chert's setup file, see Sources):

- Calls cap at 5 minutes and a line serves one call at a time, so the call segment of the demo must fit in one call.
- The agent must greet within 10 seconds of the bridge being ready, or the call ends.
- The agent process and the Chert connector must both stay running, so a laptop hosts the demo.
- Outbound calls and texts reach only phones verified for the project. Verification is an iMessage code sent from that iPhone, so we cannot cold-call a judge; we verify the demo phone in advance or have the judge call in.
- The trial is 50 FaceTime minutes and uses our own LiveKit project. Do not start the trial early; check how the hackathon line is issued first.
- Unverified: how the caller's camera frames reach our code (check Chert's video guide), and whether glasses footage can feed a call. The team needs an iPhone for verification and testing; Ashzaeen does not have one.

Source: [Chert setup file](https://app.trychert.com/skills.md), read Nov 14, 2026.

## Trust, privacy and safety

**Always-on cameras are the first objection judges and the public raise, so privacy is a product feature, not a footnote.**

- **Visible state:** the app and a spoken cue always say whether capture is on; the glasses' own recording LED stays on whenever the camera captures.
- **Consent for people:** no face or voice identification without that person's opt-in; bystanders are not enrolled.
- **Forget:** "forget the last hour" or "forget everything about Sam" deletes moments, embeddings and derived notes.
- **Minimal retention:** keep text, embeddings and a small snapshot set; discard raw video frames after processing.
- **Local first where possible:** run lightweight detection on the phone; send only what a query needs to cloud models.
- **Action safety:** anything that sends, spends or shares needs a spoken yes; every action is logged and undoable.
- **Honest limits:** Cortex is an assistive and productivity aid, not a medical or safety-critical device, and never replaces a cane, guide dog or clinician.

For the demo, use only teammates' data and get their consent first.

## Technical stack and constraints

**Apps do not run on the glasses: the phone app receives camera frames and audio over Bluetooth and does the rest.** Cortex is built on Meta's Wearables Device Access Toolkit (native iOS or Android SDK) with the Gen 1 Ray-Ban Meta glasses a teammate already owns.

| Layer | Choice | Notes |
| --- | --- | --- |
| Glasses link | Meta Wearables Device Access Toolkit | Camera via the toolkit; mic and speakers via Bluetooth audio profiles |
| Phone app | Native Swift (iOS) or Kotlin (Android) | Bridges glasses, runs light on-device steps, calls the backend |
| Speech | Streaming speech-to-text plus text-to-speech | Pick one fast provider; test latency early |
| Vision | Multimodal LLM for scene, text and object captions | Run on sampled frames and on demand, not every frame |
| Memory | Postgres with pgvector, plus object storage for snapshots | Each moment: timestamp, place, caption, transcript, embedding |
| Agent | LLM with tool calling and a confirm step | Tools: calendar, tasks, email draft, notes |
| Dashboard | Next.js web app with WebSocket updates | Timeline, Ask, proof receipts |
| Hosting | Single cloud backend (for example AWS) | Pre-warm before demo day |

**Verify tonight:** (1) the toolkit supports Gen 1 glasses, (2) real camera frame rate and end-to-end latency, (3) developer-mode and app-registration setup. If any fails, fall back to the phone camera and keep the rest of the system unchanged.

## Hackathon MVP and roadmap

**Ship one flawless loop (capture, memory, retrieval, action, proof) across three modes, and cut everything else.**

**Must ship**

- Glasses capture to phone to backend, with a visible capture state
- Searchable memory across audio and vision, with proof links
- Modes: Focus, Student and Life, switchable by voice
- Actions: calendar event, task, email draft, all with spoken confirmation
- Dashboard: Live, Timeline, Ask, Proof receipts
- Daily digest and rewind (transcript and snapshot replay)
- Network skill: log a contact and promises by voice, and draft the follow-up

**Should ship**

- Waiting-on tracker and pre-meeting brief
- Assist mode: scene and sign reading, object finder
- Privacy screen with forget by time range
- One more skill from the Skills library, chosen by reliability in rehearsal

**Cut or fake for the demo**

- Face recognition and contact memory (show as roadmap)
- Memory graph, car mode, smart tags and ambient hub
- Multi-user sharing and caregiver dashboards
- Whisper coach (ethics risk in interviews and negotiations)

**After the hackathon**

1. Calibrate retrieval accuracy and cost with real daily use
2. On-device processing for privacy-sensitive steps
3. Third-party mode SDK so others can build modes
4. Support for display glasses and other hardware
5. Open memory API so other agents can query a user's memory with permission

## Demo script (3 minutes)

**The demo must show memory, modes and action working live in the first 90 seconds, then answer one judge-chosen question.** Rehearse it end to end at least five times and record a backup video.

1. **Hook (15 s):** a teammate wearing the glasses says: "This is Cortex. It remembers, acts, and shows proof."
2. **Student mode (35 s):** a mock mini-lecture; the teammate says "switch to Student mode" and listens. Cortex makes live notes and catches a deadline ("quiz Thursday"), proposes a calendar event, and the teammate says "yes".
3. **Life mode (30 s):** the teammate sets keys on a table, picks up a book, talks to a friend about dinner plans. Cortex proposes a reminder.
4. **Network skill (35 s):** a teammate plays a sponsor, introduces herself as Priya and promises an intro. Cortex logs the contact, adds the promise to the waiting-on list, and drafts a follow-up. Then: "Brief me on Priya" returns the conversation, the open promise and the draft.
5. **The wow question (25 s):** a judge asks anything, for example "Where did I leave my keys, and what did I agree to for dinner?" Cortex answers by voice and the dashboard shows the exact snapshot and transcript line.
6. **Assist mode (15 s):** the teammate looks at a sign; Cortex reads it aloud and flags an obstacle.
7. **Proof and close (25 s):** the dashboard shows the actions created, with source moments and undo; "forget the last hour" runs live; then the one-line pitch and the roadmap.

## Team roles and timeline

Assumes about 36 hours of build time; adjust phase lengths to the real schedule.

| Role | Owner | Owns |
| --- | --- | --- |
| Glasses and phone pipeline | CpE teammate | Toolkit setup, Bluetooth audio and camera streaming, latency, capture indicator, phone app bridge |
| Perception and memory | CS 1 | Speech-to-text, vision captions, embeddings, retrieval with proof |
| Agent and modes | CS 2 | Mode definitions, action loop, integrations, confirmation flow |
| Dashboard and demo | CS 3 | Web dashboard, timeline and proof receipts, demo script, pitch and Devpost |

**Phases**

1. **Hours 0 to 4:** lock scope; get the toolkit sample app running; stand up the backend skeleton. Decision gate: glasses work, or switch to the phone-camera fallback.
2. **Hours 4 to 12:** end-to-end capture to memory to a basic Ask answer. Nothing else until this works.
3. **Hours 12 to 22:** modes, the action loop, calendar and task integrations, dashboard Timeline and Proof receipts.
4. **Hours 22 to 30:** Assist mode, privacy screen, error handling, latency tuning, polish.
5. **Hours 30 to 36:** freeze features, rehearse the demo repeatedly, record a backup video, write the Devpost, sleep in shifts.

## Competition, differentiation and risks

**The space is crowded, so Cortex wins on execution of three things competitors rarely combine: multimodal memory, action, and proof.**

| Existing approach | Examples | Gap Cortex fills |
| --- | --- | --- |
| Audio-only memory wearables | [Bee (acquired by Amazon)](https://the-gadgeteer.com/2026/05/05/best-ai-wearables-2026/), Omi, [Limitless (acquired by Meta, no longer sold)](https://yespress.io/limitless-pendant) | No vision; mostly summaries and reminders, not follow-through |
| Glasses with memory | [Brilliant Labs Halo](https://venturebeat.com/business/brilliant-labs-launches-halo-glasses-a-new-generation-of-privacy-first-smartglasses), Meta AI features | Single-persona memory; proof and action loop less emphasized |
| Platform assistants | Meta AI, phone assistants | Not an open, mode-based layer with auditable receipts |

**Questions judges will ask**

- **"Isn't this Bee or Limitless?"** Those are audio-only and passive; Cortex adds vision, modes and executed actions with proof.
- **"Won't Meta build this?"** Possibly; Cortex is the open mode and action layer on top, and the demo shows behavior they have not shipped.
- **"What about privacy?"** Visible capture state, opt-in for people, forget commands, minimal retention, and confirmation before any outbound action.
- **"How accurate is retrieval?"** Every answer cites its source moment, so errors are visible and correctable.

**Top risks and fallbacks**

| Risk | Fallback |
| --- | --- |
| Gen 1 glasses or the toolkit do not work as expected | Phone camera and earbuds; same backend |
| Venue Wi-Fi fails | Personal hotspot; pre-recorded backup video |
| Latency too high for live voice | Snapshot-on-demand instead of continuous vision; cache common answers |
| Retrieval hallucination | Answer only from retrieved moments; say "I don't have that" otherwise |
| Scope creep | Feature freeze at hour 30; cut list above is final |

**Sources:** [The Gadgeteer, best AI wearables 2026](https://the-gadgeteer.com/2026/05/05/best-ai-wearables-2026/); [Yespress, Limitless pendant](https://yespress.io/limitless-pendant); [VentureBeat, Halo Glasses launch](https://venturebeat.com/business/brilliant-labs-launches-halo-glasses-a-new-generation-of-privacy-first-smartglasses); [UploadVR, Device Access Toolkit](https://www.uploadvr.com/meta-wearables-device-access-toolkit-public-preview/).
