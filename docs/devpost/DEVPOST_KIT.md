# Devpost kit for Cortex

Everything below is taken from the repo on `main` (PRD, `docs/STATUS.md`, ADRs, contract, code). Paste-ready blocks are marked **PASTE**. Your existing story is good; this fills the gaps (diagrams, a technical section, track write-ups, contributions) and flags a few lines that claim more than `STATUS.md` says is verified.

**Caveat:** I could not open the Devpost page myself (403), so I worked from the text you pasted. I also do not know which prize tracks you entered, so the track blocks in section 4 cover the sponsors that appear in your Built With list. Delete the ones you did not enter.

## 0. Do this in the next 2 hours, in this order

1. Upload the 5 diagrams (section 1) to the image gallery. Put #1 and #4 inline in the story with the editor's image button (the `![...](file.png)` lines in the blocks below are placeholders; delete them and insert the image by hand). About 10 minutes, biggest visual win.
2. Paste **A. System architecture** (section 2) into "How we built it", above or replacing the bullet list.
3. Paste the track blocks you actually entered (section 4).
4. Paste **Try it in 60 seconds** (section 5) above "Built With".
5. Fill the empty "Describe your contribution" boxes (section 6).
6. Apply the accuracy fixes (section 7). Three of them matter if a judge pokes at the demo.
7. Add the extra Built With tags (section 8).

---

## 1. Diagrams (upload as gallery images)

Files are in `docs/devpost/diagrams/` (PNG, 1800x1200, 3:2, which is Devpost's gallery ratio). Editable `.svg` copies sit next to them.

| # | File | Where it goes | Caption (paste) |
| --- | --- | --- | --- |
| 1 | `1-system-architecture.png` | Inline under "How we built it"; make it the 2nd gallery image | Every channel (glasses, phone, FaceTime, dashboard) talks to one memory API. MongoDB Atlas holds the memory, Tiger Data the timeline and audit log, Gemini does perception and reasoning. |
| 2 | `2-memory-and-proof.png` | Gallery | Remember: one ingest pipeline for every channel. Answer: only from retrieved moments, otherwise "I don't have that in memory." Every answer writes a proof receipt. |
| 3 | `3-action-loop.png` | Gallery | Notice, propose, confirm, do, prove. Nothing that leaves the device happens without a yes, and every action has a receipt and an undo window. |
| 4 | `4-facetime-call-flow.png` | Inline under the Chert track block; make it the 3rd gallery image | FaceTime into a LiveKit room, a Gemini Live agent that sees the caller's camera, and tools that call the same Cortex API the glasses use. |
| 5 | `5-modes-over-one-memory.png` | Gallery | Focus, Student, Life and Assist are presets over one shared memory, not separate apps. |

Suggested gallery order: dashboard screenshot first (it is your best thumbnail), then 1, 4, 2, 3, 5.

---

## 2. Technical sections

### PASTE: A. System architecture (add to "How we built it")

```markdown
## System architecture

Cortex is built around one rule: **channels are adapters, memory is the product.** The glasses, a phone camera, a FaceTime call and the dashboard all talk to the same memory API, and that API is defined once, in an OpenAPI contract with JSON Schemas that every area builds and tests against.

**Capture.** *Cornea*, a native Swift iOS app on Meta's Wearables Device Access Toolkit, streams the Ray-Ban Meta camera, captures a photo or a clip of up to 10 seconds, checks the privacy state, and posts it to `POST /moments`. It also has a push-to-talk loop over the glasses' Bluetooth mic. A phone-camera Capture sheet in the web app posts the same payload as a fallback.

**Backend.** Python and FastAPI on Railway. One ingest pipeline: Gemini perception (scene caption, spoken words in video, introductions, promises) → `gemini-embedding-001` → MongoDB Atlas, with a Tiger Data timeline row → derived records (contact card, promise chip, list items, follow-up proposal) → a Server-Sent Event so the dashboard updates in seconds.

**Memory.** MongoDB Atlas Vector Search with a time-range filter. Atlas search indexes update asynchronously, so moments from the last few minutes are scored locally and merged in, which means something said 30 seconds ago is findable right away. Tiger Data (Postgres + TimescaleDB hypertables) holds the timeline, context stream, capture metrics and an append-only audit log of every action.

**Answering with proof.** `POST /ask` routes rewind, digest, lists, "brief me on X" and open-promise questions to deterministic handlers built from stored records, and everything else to search plus Gemini. Gemini may answer only from the retrieved moments, and the moment ids it cites are checked against the search hits. No support means "I don't have that in memory." Every answer writes a receipt with its source moments.

**Action loop.** Notice, propose, confirm, do, prove. Emails are held for a 30-second undo window, and a held send survives a server restart. Calendar events, emails and texts always need a yes; auto-run is off by default and limited to reminders, notes, flashcards and expenses.

**Call layer.** A Chert line bridges FaceTime into our own LiveKit room. A Node LiveKit Agents worker running Gemini Live greets within the 10-second window, sees the caller's camera, and calls Cortex through tools (`ask_memory`, `brief_person`, `save_what_you_see`, `draft_followup`, `send_followup`, `undo_followup`). The agent and the Chert connector both run on Railway, so no laptop has to stay on.

**Dashboard.** Next.js 16 and Tailwind 4 on Vercel, iPhone first, in our own "Brass" design system. It calls the API through a same-origin `/api` proxy and listens to `GET /events` over SSE. It also has a public `/demo` profile that runs with no account.
```

### PASTE: B. Technical specifications (add after A)

```markdown
## Technical specifications

| | |
| --- | --- |
| **Contract** | OpenAPI 3 with 87 operations plus JSON Schemas for moments, people, promises, actions, receipts, modes, routines and list items. Backend responses, the mock API and the generated dashboard types are all checked against it in CI. |
| **Backend** | Python 3.11+, FastAPI, synchronous handlers on threads, one Docker process on Railway (SSE broker and undo timers live in process). About 7,500 lines of Python plus 150+ backend tests that validate every response against the contract. |
| **Memory** | MongoDB Atlas with Atlas Vector Search (`$vectorSearch`, time filter, freshness merge). Documents map one-to-one to the JSON Schemas. Snapshots and videos (stored as 4 MB chunks) live in MongoDB too, so redeploys keep them. |
| **Time series** | Tiger Data (Postgres + TimescaleDB): hypertables `timeline`, `context_stream`, `action_log`, `capture_metrics`, and an `hourly_activity` continuous aggregate. Optional by design: with it off, the backend runs on MongoDB alone. |
| **Models** | Gemini for perception, embeddings (`gemini-embedding-001`, separate query and document task types), grounded answers, briefs and email drafts. Gemini Live native-audio model for the call agent. |
| **Capture** | Swift (about 5,800 lines) on Meta Wearables Device Access Toolkit 1.0.1. Photos and clips of up to 10 s, push-to-talk, privacy check before every upload. |
| **Call agent** | Node 24, LiveKit Agents 1.8, Gemini Live, about 1,200 lines. Hosted on Railway beside a Chert connector with a persistent volume for the sign-in. |
| **Dashboard** | Next.js 16, React 19, TypeScript, Tailwind 4, Motion, three.js for the 3D pairing scene. About 10,700 lines of TS. Same-origin proxy, SSE, Web Speech tap-to-talk. |
| **Auth and actions** | Google sign-in; Calendar, Tasks and Drive via the user's token; email via Resend; texts via the Chert line. |
| **Skills and modes** | 20+ skill modules (Network, Waiting-on, Brief, Ask, Digest, Rewind, Lists, Translate, Immersion, Coach, Proactive nudge and more) over four modes. |
| **Privacy** | No face recognition. Pause and off-the-record return 409 on ingest. `DELETE /moments/{id}` cascades to the embedding, media, derived promises, introduced people and the Tiger row, and returns a deletion receipt. |
| **Delivery** | Dashboard on Vercel deploys on every push to `main`. A GitHub Actions workflow redeploys the backend after `make check` passes and has a manual deploy-call-agent workflow with a rollback input. |
| **Process** | Contract-first, five areas built in parallel against a stateful mock, decision records (ADRs), and a `STATUS.md` board where nothing is marked "works" until someone has run it. `make check` runs lint, contract validation, 150+ backend tests, 166 mock contract checks, 300+ demo-profile checks and a secret scan on every push. |
```

### PASTE: C. Three flows (optional, add if you have room)

```markdown
## How one moment travels

1. **Meet.** The wearer says "This is Ash from Acme." Cornea posts a frame and the words. Gemini captions the scene and extracts the introduction, so a contact card appears on the dashboard with the moment attached.
2. **Promise.** Ash says "I'll send you the deck Friday." Cortex proposes a promise chip. One tap confirms it, and it joins Waiting on with its source moment.
3. **Ask.** "What did Ash promise me?" is answered from the promises table with the exact moment, spoken aloud, and a proof receipt is written.
4. **Brief.** "Brief me on Ash" reads the person's moments and open promises and speaks about 20 seconds.
5. **Act.** Cortex proposes a follow-up email, you approve it, it is held for a 30-second undo window, then sent with a receipt.
6. **Call.** Later you FaceTime Cortex from any iPhone, hold up a business card, say "save this", then ask "What is open with Ash?" and it answers from the same memory.
```

---

## 3. Optional tagline tweaks

Your tagline is good. If you want it shorter for cards: **"A second brain for smart glasses that remembers what you see, answers with proof, and follows up."**

---

## 4. Track write-ups

Devpost has no "tracks" field in the story, so put these under a heading such as "Prizes we're going for". Keep only the sponsors you actually entered. The facts below come from the code and `STATUS.md`; I only know Chert's track name from the repo (Best Use of FaceTime), so check the exact prize names on the hackathon page.

### PASTE: Chert · Best Use of FaceTime

```markdown
### Chert: Best Use of FaceTime

Cortex treats FaceTime as a real channel for the same brain that runs on the glasses, and it uses **video**, not just voice.

- **The caller's camera is an input.** Frames from the FaceTime video feed Gemini Live in real time. Hold a business card, receipt or whiteboard up and say "save this": the agent calls `save_what_you_see`, which posts the newest frame to `POST /moments` with `source: call`, and the card becomes a searchable memory with a Gemini caption and a capture receipt. It saves only when the caller asks, because a person may be in frame.
- **Answers come from memory, not from the model's imagination.** The agent's tools call the same `/ask` and brief endpoints as the glasses. On two real FaceTime Video calls it answered "What did Sam promise me?" from stored moments.
- **It meets Chert's hard limits.** It greets on `bridge_ready` and spoke 3 to 4 seconds after FaceTime was ready (the limit is 10). It keeps working inside the 5-minute cap and one-call-per-line rule, and it reports `call.started` and `call.ended` so the dashboard shows an "On Call" pill and a 5:00 timer.
- **It runs with no laptop.** A LiveKit Agents worker and a Chert connector (`chert dev`) run as two Railway services, with a volume that keeps the Chert sign-in across restarts.
- **It can close the loop by voice.** The agent can draft a follow-up email, read back the subject, send only after an explicit spoken yes, and undo inside 30 seconds.

![FaceTime call flow](4-facetime-call-flow.png)
```

### PASTE: MongoDB Atlas

```markdown
### MongoDB Atlas

MongoDB Atlas is Cortex's memory, not a side store. Moments (transcript, Gemini caption, embedding, source, timestamp), people, promises, actions and receipts are Atlas documents that map one-to-one to our JSON Schemas.

- **Atlas Vector Search** powers recall. We embed each moment and run `$vectorSearch` with a time-range filter ("yesterday", "this morning") so a question narrows to the right window first. On the hosted stack, the four seeded questions returned the right source moment first, 12 of 12 across 3 runs.
- **Freshness merge.** Atlas search indexes update asynchronously, so moments from the last few minutes are scored locally and merged with the vector hits. A promise made 30 seconds ago is findable right away, which the live demo needs.
- **Media in the same store.** Snapshots and 10-second videos are stored in MongoDB (videos as 4 MB chunks), so redeploys do not lose proof.
- **Delete means delete.** One cascade removes a moment, its embedding, media, derived promises and the people it introduced.
```

### PASTE: Gemini API

```markdown
### Gemini API

Gemini is used in four distinct ways, and the call agent runs on its realtime model.

- **Perception.** One call per moment turns a photo or a 10-second clip into a caption, the words spoken in the video, introductions ("This is Ash from Acme") and promises with due dates.
- **Embeddings.** `gemini-embedding-001` with separate query and document task types for retrieval.
- **Grounded answers.** Gemini may answer only from the retrieved moments, and the moment ids it cites are checked against the search hits. No support means "I don't have that in memory."
- **Briefs and drafts.** Spoken 20-second pre-meeting briefs and follow-up email drafts, with a template fallback built from the same data so a slow response never kills the demo.
- **Gemini Live on FaceTime.** The call agent uses Gemini's native-audio live model for voice and the caller's camera frames, and calls Cortex through function tools.
```

### PASTE: Tiger Data

```markdown
### Tiger Data

Tiger Data (Postgres + TimescaleDB) is Cortex's time spine: the "when did it happen" layer next to MongoDB's "what happened".

- **Hypertables:** `timeline` (one row per moment), `context_stream` (place, calendar and mode over time), `action_log` (append-only audit of every action state change) and `capture_metrics` (latency and size per processed moment).
- **Continuous aggregate:** `hourly_activity` feeds the daily digest and the activity strip.
- **What it unlocks:** time-range recall, rewind, forget-by-range, and a trustworthy audit trail behind every receipt.
- **Degrades safely:** if Tiger Data is down or unset, every helper becomes a no-op and the backend falls back to MongoDB, so the demo never depends on one database.
```

---

## 5. Try it in 60 seconds

### PASTE (above "Built With" / in "Try it out" description)

```markdown
## Try it in 60 seconds

No account needed: open **https://cortex-dashboard-seven.vercel.app/demo**. It loads a week of sample memories across all four modes. Then:

1. Open **Ask** and try: "Where did I leave my keys?", "What did Sam promise me?", "What do I owe Dana?" Each answer opens its **proof receipt**, the exact moment it came from.
2. Open **People** and pick Ash for the pre-meeting brief: who they are, what you discussed, what is still open.
3. Tap the camera button in the status pill, type "I'll send you the deck Friday." and watch a confirm chip appear. One tap puts it in **Waiting on**, linked to the moment.
4. Open any moment and delete it, or pause capture from the status pill, to see privacy work: deletion removes what was derived from it too.

Sign in with Google at the landing page to use the real backend, or open the API health check to see it live.
```

> Verify steps 1 to 4 once on your phone before pasting. They come from `apps/dashboard/README.md` and the demo profile test, not from me clicking through the live site. Ash is already seeded in `/demo` (met at the career fair), so typing "This is Ash from Acme." updates Ash's card instead of creating a new one.

---

## 6. Team contributions (fill "Describe your contribution")

Drafts from the git history (who authored what), not from `AGENTS.md`, which lists different owners for iOS. Confirm each with its person before pasting, because some commits may sit under a shared or different identity.

- **Ashzaeen Fatmi Khan:** "Led product and system design: wrote the PRD, priority plan and OpenAPI contract, and built the Gemini skills (Network, promises, brief, ask-with-proof, digest, rewind, modes), the action loop, the Next.js dashboard and the demo profile. Set up hosting on Railway and Vercel, CI, and the status board that kept the team honest."
- **Md Ahnaf Al Zabir:** "Built the Chert FaceTime agent: the LiveKit Agents worker, the 10-second greeting on bridge-ready, and the caller-camera vision pipeline into Gemini Live. Then connected it to Cortex memory (ask, brief, save-what-you-see), the call lifecycle events, voice follow-up email and the hosted Railway setup."
- **Md Sameer Khan:** "Built Cornea, the native iOS capture app on Meta's Wearables Device Access Toolkit: glasses camera streaming, photo and 10-second video capture, uploads to the Cortex API, push-to-talk voice over the Ray-Ban Bluetooth mic, and API credential handling. Also owned the glasses hardware and testing."
- **Md Abrar Al Zabir:** "Built the first version of the FastAPI backend and the follow-up email action, and decided the backend stack (FastAPI) and data store (MongoDB Atlas plus Tiger Data)."

---

## 7. Accuracy fixes to your current text

`docs/STATUS.md` marks only D-2 (search) as `works`. These lines in your story go further than that file does. A judge who tries the live demo could catch them.

| Your text | Problem | Safer wording |
| --- | --- | --- |
| "waits for your yes, **sends it**, and logs a receipt" (What it does) | No real email send has run yet. Gmail SMTP failed on Railway (outbound SMTP is blocked) and the Resend path has not been proven with a real send. | "waits for your yes, holds it for a 30-second undo window, sends it, and logs a receipt". Only keep "sends it" if someone has sent one real email since the last STATUS update; otherwise say "queues it" |
| "**tap-to-talk reads answers aloud through the glasses' speakers**" (Dashboard) | Tap-to-talk was checked in a browser with a fake recognizer, not on a real iPhone with the glasses' Bluetooth mic. | "tap-to-talk reads answers aloud, and routes through the glasses' speakers when they are the phone's Bluetooth audio device" |
| "**About 20 skills** and four modes run on one memory" | Fine, but most were verified against the mock LLM, not Gemini. | "20+ skill modules and four modes share one memory" is accurate and still strong |
| "Google Calendar, Tasks and Drive notes are built and waiting on live testing" (What's next) | Accurate. Keep. | |
| "Cortex picked up instantly and spoke within 3 to 4 seconds" | Accurate per logs, but those two calls were read from logs and data, not run by the team. | Add "(measured from the call logs)" if you want to be precise |
| Challenges list | Missing a good real one. | Add: **"Cloud limits we hit."** Railway blocks outbound SMTP, so Gmail sending failed with "Network is unreachable"; we moved to an HTTPS email API. Slim container images lacked CA certificates, so every LiveKit job failed until we installed them. |

### PASTE: extra challenge bullet

```markdown
* **Cloud limits we only found by deploying.** Railway blocks outbound SMTP, so our first real email attempt died with "Network is unreachable" and we moved to an HTTPS email API. Our slim Node image had no CA certificates, so every LiveKit job failed with "no native root CA certificates found" even though the library loaded. Atlas search indexes update asynchronously, so a promise said 30 seconds ago was not findable until we merged recent moments in locally.
```

---

## 8. Built With: tags to add

You already have chert, docker, fast-api, gemini, github-actions, ios, meta-wearables-device-access-toolkit, mongodb, next.js, node.js, python, react, swift, tailwindcss, three.js, tiger-data, typescript. Add:

`livekit`, `gemini-live`, `railway`, `vercel`, `openapi`, `server-sent-events`, `resend`, `timescaledb`, `atlas-vector-search`, `google-calendar-api`

Devpost limits the number of tags, so drop the least informative first (react and docker are the safest to lose).

---

## 9. What I could not verify

- Your current Devpost page and prize-track selections (403 from Devpost).
- Anything on real hardware: capture on Gen 1 glasses is still `in progress` in `STATUS.md`.
- Whether `/demo` steps in section 5 behave exactly as written on the live deployment.
- Whether the Railway deployment currently matches `main`; STATUS notes a hosted backend and call agent need manual redeploys.
