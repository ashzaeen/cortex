# YouTube demo video script: "The Career Fair Test" (target 2:50, hard cap 3:00)

A two-person shoot script for the hackathon submission video. It is **not** the frozen on-stage script ([DEMO_SCRIPT.md](DEMO_SCRIPT.md), which stays as is). It reuses the same through-line, a promise made in conversation comes back later with proof and on a FaceTime call, and it uses the same fake people (**Ash from Acme**, seeded **Sam Rivera from Globex**). Source of truth for what the product can do: the PRD, the priority plan, [STATUS.md](STATUS.md) and [BLOCKERS.md](BLOCKERS.md). Written 2026-11-15 against `origin/main` at `b370433`.

**One-line story.** A student works a career fair wearing Ray-Ban Meta glasses. Cortex captures the flyers, the conversation in the queue and the recruiter's promise. On the drive home the student FaceTimes Cortex, which answers from that memory, reads one more flyer off the phone camera, and emails the recruiter after a spoken yes. Back at the laptop, every answer opens the exact clip it came from.

**Pitch line for the end (rehearse it):** Meta AI answers about what you see right now. Cortex remembers across days, shows the moment behind every answer, and follows through with actions you approve.

## 1. Reality check: your idea vs. what the repo does today

Film and say what is true, so a judge who reads the repo is not surprised.

| Idea | What the code does | So in the video |
| --- | --- | --- |
| "Records all conversations through video streaming" | Cornea (iOS) captures **photos and clips auto-stopped at 10 seconds**, on a cue (a tap), and checks `GET /privacy` first. It is not continuous recording, on purpose (battery, privacy). | Show many short captures. Say "captures on cue", never "records everything". |
| "Stored in the Meta database" | Meta's toolkit streams to **Cornea** on the iPhone, which posts `POST /moments` to **Cortex**. Gemini captions and transcribes, memory is **MongoDB Atlas** (vector search), the time index is **Tiger Data**. | Say "Cortex memory (MongoDB Atlas and Tiger Data)". |
| "Chert agents with async memory, real-time synced" | Chert is only the FaceTime bridge into a LiveKit room. Our call agent has no memory of its own. It calls the same Cortex API live: `ask_memory`, `brief_person`, `save_what_you_see`, `draft_followup`, `send_followup`, `undo_followup`. | Say "same memory, live". |
| Spoken words in the clips | The perception prompt was changed to return spoken words from video; **offline tests only, not yet seen with real Gemini** (BLOCKERS section 4). | **Test this first** (pre-flight 3). Fallback below. |
| Draft an email to a recruiter | Works as propose, confirm, 30 s undo. Every draft goes to **one hardcoded address** (`FOLLOWUP_EMAIL_TO` in `apps/backend/core/config.py`). Hosted SMTP is blocked on Railway; the real send needs `EMAIL_PROVIDER=resend`. No real send has run yet (STATUS D-7). | The "recruiter" inbox must be that address, or change the variable. Pre-flight 2. |
| Proof shown on the call video | **Not built** (CALL-4). The caller sees an animated face. | Show proof on the dashboard instead. Do not script it on the call. |
| Cortex reads a flyer on the call | Works: the agent sees the phone camera about once a second. It saves a picture **only when the caller says "save this"**. | Say "Save this" while holding the flyer up. |
| Spoken answers on the glasses | Cornea has push-to-talk "Ask Cornea" that speaks the answer; STATUS still lists it as unverified on real glasses. | Optional insert only if you have run it on the glasses. |

## 2. Cast, props, set

- **W (wearer, the student):** glasses, iPhone with Cornea (API key saved in the gear menu), also the FaceTime caller. Narrates the voiceover.
- **O (operator):** second phone on a tripod or gimbal, plus a laptop with the dashboard. Plays **Ash** (and Sam) in the POV clips, and films everything else.
- **A third person, if you can find one:** plays the "other candidate" in the queue, so O does not play both. If not, use Plan B below.
- **Set:** a staged career fair, not a real one. Use a hallway or student-union table with a "Globex" and an "Acme" table tent, printed flyers, a few props and a tote bag. Real recruiters and strangers are real people, and repo rules say demo data uses fake names and teammates' own data only (AGENTS.md safety rules, PRIV-14). Wide shots of a real hall are fine if nobody is identifiable and you drop the audio.
- **Printed flyers (fake, `.example` domain):** Acme "Design and Product Intern, apply by Nov 22, acme.example/careers"; Globex "ML Infra Internship, applications close Nov 20"; one business card for Ash.
- **A throwaway moment** (a clip of your lunch) for the delete shot in scene 5.
- **Phone contact:** save the Chert line in the iPhone as "Cortex" with a photo, so the FaceTime screen reads cleanly.

## 3. The script, scene by scene

Times are the finished edit. Live audio is the real clip or call audio; **VO** is recorded cleanly afterward in a quiet room (full text in section 4).

### Scene 1: Hook (0:00 to 0:12, 12 s)

| | |
| --- | --- |
| Shots | (a) Hand-held, busy hallway, long queue, W holding a tote bag full of flyers. (b) Close on the flyers spilling out. (c) Phone screen: Photos app, a camera roll of 40 clips, thumb scrubbing. (d) Black card: **"This time, I wore Cortex."** with the glasses on the table. |
| Audio | VO line 1, light music under it. |
| On screen | Burned-in subtitle of the VO. Lower third: "Career fair, 3 hours, 1 brain." |
| Who | O films, W holds the bag. No lines. |

### Scene 2: At the fair, Cortex captures (0:12 to 0:50, 38 s)

Shoot these **in this order and within about 5 minutes of each other**. Backend rule: moments within 5 minutes after an introduction link to that person, and a spoken promise is attributed to the person just introduced (backend README, "Speaker attribution"). So the overheard clip comes **before** "This is Ash".

| # | Time | Shot | Live audio (exact words) | Capture |
| --- | --- | --- | --- | --- |
| 2a | 0:12 to 0:24 | POV in the Globex queue, W looking at the table tent. Cornea tap, a small "REC 10s" graphic added in post. | Candidate (third person, or O off frame): "Does the ML infra internship take sophomores?" Sam: "Yes. Applications close November twentieth, and send a GitHub link with it." | 10 s clip, `source: glasses` |
| 2b | 0:24 to 0:34 | POV at the Acme table, Ash across the table. | W: "This is Ash from Acme." Ash: "Nice to meet you. We're hiring a design intern." | 10 s clip |
| 2c | 0:34 to 0:42 | Same shot, closer. | Ash: "I'll send you the application link Friday." | 10 s clip (the Track It chip trigger) |
| 2d | 0:42 to 0:50 | POV down at the Acme flyer, then the Globex flyer. | W: "Remember this." | Photo each, uploaded immediately |

VO over 2a's setup and a short Cornea screen insert (2 s, screen-record: "Uploaded", glasses connected). Add a one-second shot of the glasses' LED lit to show capture is visible.

Plan B with two people (no third person): O stands just out of frame by the Globex sign and says both overheard lines in one take. Only the voices and the sign show in the POV.

Fallback if the clips come back with no transcript (pre-flight 3 fails): W says each line aloud into the dashboard's Capture sheet (phone fallback, `source: phone`) while holding the photo. It is the same endpoint, and the glasses stay in the story through the POV footage.

### Scene 3: The memory fills in live (0:50 to 1:08, 18 s)

| | |
| --- | --- |
| Shots | (a) Laptop screen recording, the Cortex dashboard on the Home screen, captured **during** scene 2 so the updates are real: timeline cards arriving, then the **Ash, Acme** contact card appears, then the **Track It** chip with "Ash: send the application link, Friday". (b) Cursor taps **Track It**, it moves to Waiting On. (c) 4-second architecture graphic (below). |
| Audio | VO line 3. No live audio. |
| On screen | Graphic: Ray-Ban Meta, then Cornea (iOS), then Cortex API with MongoDB Atlas and Tiger Data and Gemini; a second path labelled "Cortex on FaceTime (Chert and LiveKit)" into the same box. Caption: "One memory. Every channel." |
| Who | O records the laptop. W taps Track It. |

### Scene 4: The call, FaceTime Cortex (1:08 to 2:08, 60 s)

Staged in a **parked** car (engine off, phone on a dash mount). Do not film a FaceTime call while driving. Put the call on speaker and film the screen with O's phone over the shoulder, plus a tripod close-up of the FaceTime screen. iOS screen recording usually drops the other side's call audio, so test 10 seconds first. If the glasses carry the call audio as a Bluetooth headset, say so; test it.

Raw call lasts about 70 s and gets trimmed to 60. Cut the 5 to 7 seconds of silence before the greeting (measured on real calls). Cortex's wording will vary because it is a live model, so the lines below give the **gist to expect**; only W's words are fixed. It answers only from memory, so every W question has a matching moment from scene 2.

| # | W says (exact) | Cortex says (gist) | Proves |
| --- | --- | --- | --- |
| 4a | taps FaceTime on "Cortex" | "Hi, I'm Cortex, an AI. How can I help?" | Greets inside Chert's 10 s limit |
| 4b | "Hey Cortex, I'm heading home from the career fair. When does the Globex internship application close?" | "Globex applications close November 20, and they want a GitHub link. You heard that in line this morning." | Retains what **other people** said |
| 4c | "Brief me on Ash." | About 20 s: Ash, Acme, product lead, hiring a design intern, promised the application link by Friday, still open. | Pre-meeting brief from stored data |
| 4d | Holds the Acme flyer 1 to 2 ft from the camera: "Here's Acme's flyer. Save this." | Reads the title or deadline it sees, then "Saved to your memory." | Fresh caller-camera video (weighted double in the Chert track) |
| 4e | "Draft a follow-up email to Ash." | Reads the subject and one sentence, "Shall I send it?" | Action loop |
| 4f | "Yes, send it." | "Sent. It goes out in about 30 seconds, say undo that to cancel." | Confirm-before-send with undo |
| 4g | "Thanks, Cortex." | | Hang up |

On screen: burned-in captions for both sides, a small lower-third on 4d: "Caller camera, 1 frame/s, saved only when asked", and on 4f: "Undo window: 30 s". Optional split-screen in the corner: the dashboard's **On Call** pill and 5:00 timer. Use it only if `/calls/started` is live on the hosted backend; the agent logs a 404 until then.

Chert limits to plan around: 5-minute cap, one call at a time, wait about 30 seconds between takes (early calls dropped), 50 trial minutes total, and the phone must be verified or have texted the join phrase once.

### Scene 5: Proof back at the desk (2:08 to 2:35, 27 s)

| # | Time | Shot | Notes |
| --- | --- | --- | --- |
| 5a | 2:08 to 2:15 | Dashboard Timeline: the new **call** moment ("Shown on the call: Acme design intern flyer") sits next to the glasses clips. | Shows both channels in one timeline |
| 5b | 2:15 to 2:22 | Ask sheet: "What did Ash promise me?" Quote and proof appear, tap the proof, **the 10-second clip plays** with Ash's voice. Cut to the People sheet: the new **brief card** (headline, open items overdue first, last-time quote, opener). | Core "proof" moment. The brief card is on `main` only (b370433), so run from current `main` |
| 5c | 2:22 to 2:28 | Receipts sheet: the email receipt with its source moments and the **Undo** countdown; 2-second cut to the recruiter inbox showing the email arrived. | Needs a real send (pre-flight 2). If it only saves a draft, say "draft" in the VO |
| 5d | 2:28 to 2:35 | Tap the status pill: **Pause**, the ring goes hollow. Open the throwaway moment, **Delete**, the toast "Deleted, with undo". | Privacy minimum (D-9) |

### Scene 6: Close (2:35 to 2:50, 15 s)

W to camera or a clean desk shot, glasses in hand. VO: the pitch line. End card: **Cortex. Other devices remember. Cortex remembers, acts, and shows its proof.** Below it: HackUTA 2026, the Chert FaceTime track, the repo and dashboard links, team names. Hold 3 seconds.

## 4. Voiceover (read clean, about 170 words)

1. (Scene 1) "Every career fair ends the same way: a bag of flyers, a camera roll of clips, and a night of scrubbing to remember who promised what." *(card: "This time, I wore Cortex.")*
2. (Scene 2) "Cortex lives in my Ray-Ban Meta glasses. On a cue, it captures what I see and hear: a photo, or a ten-second clip. Even the conversation in line, which I'd never have remembered."
3. (Scene 3) "Cornea, our iPhone app, sends every moment to Cortex, transcribed, captioned and indexed in MongoDB Atlas and Tiger Data. Ash becomes a contact. The promise becomes a tracked item, with its source moment."
4. (Scene 4 intro) "On the drive home, I don't open an app. I FaceTime Cortex."
5. (Scene 5) "Every answer comes with proof: the exact clip it came from. The email has a receipt and an undo. And everything is deletable, or off the record, in one tap."
6. (Scene 6) "Meta AI answers about what you see right now. Cortex remembers across days, shows the moment behind every answer, and follows through with actions you approve."

## 5. The 2:00 cut

Same story, shorter. Cut scene 3's architecture to 3 s and merge it into scene 2; drop 4b or 4d (keep 4d for the Chert track); drop 5a.

| Scene | Length | Running |
| --- | --- | --- |
| 1 Hook | 8 s | 0:08 |
| 2 Fair (2a short, 2b+2c merged, 2d) | 26 s | 0:34 |
| 3 Dashboard and architecture | 10 s | 0:44 |
| 4 Call (4a, 4c, 4d, 4e+4f) | 42 s | 1:26 |
| 5 Proof (5b, 5c, 5d) | 20 s | 1:46 |
| 6 Close | 14 s | 2:00 |

## 6. Pre-flight (do these before anyone films)

1. **Run from current `main`** and freeze pushes on shoot day: a push can redeploy the backend and drop a live call. Check `/health` on the hosted backend.
2. **Email:** the follow-up goes to one hardcoded address. Decide whose inbox plays Ash, then set `FOLLOWUP_EMAIL_TO` to it. Hosted SMTP fails on Railway, so use Resend and prove it once:
   ```bash
   make -C apps/backend actions-doctor ARGS="--email-to <the demo inbox>"
   ```
   Confirm `/health` shows `email_dry_run: false`.
3. **Clip transcripts:** capture one 10-second clip of W speaking on the real glasses, then open it in the Timeline. If the transcript is empty, use the Capture sheet fallback in scene 2.
4. **Cornea:** API key saved under the gear menu ("Save and verify API key"), glasses charged (streaming drains the battery), capture state visible.
5. **Chert:** run `chert doctor` for the line number and the trial minutes left (the line number can change; do not hard-code it on screen). The demo iPhone is verified or has texted the join phrase. Budget: each take costs about 2 minutes.
6. **Data:** `make seed` for a clean start; remove Ash's moments between takes (delete from the Timeline, which cascades) so the live introduction works every time. Do your rehearsals on a scratch database, not the demo data.
7. **Say the exact names aloud once** ("Ash", "Acme", "Globex"). "Ash" is short and can be misheard; the confirm card lets you correct it.
8. **Full dry run twice, start to finish,** with the screen recording running.

## 7. Shoot order (so the real data lines up)

1. Block 1 (about 1 h): scene 2 captures in order, laptop recording the dashboard (scene 3) at the same time. Do the whole sequence once for real; re-shoot only the POV audio if needed.
2. Block 2: scene 4 in the parked car. Three to four takes, 30 seconds apart. Keep the best one whole; do not splice Cortex's audio from different takes.
3. Block 3: scene 5 on the laptop right after the call, so the call moment and receipt are real.
4. Block 4: hook b-roll, the camera-roll shot, the VO and the end card.

## 8. Say, and don't say

- Say: "captures on cue", "ten-second clips", "same memory, live", "proof", "you approve every action".
- Do not say: "records everything", "always listening", "shows the proof on the call video", "recognizes faces" (it does not identify anyone by face or voice today), "Meta stores it".
- If you use a fallback (phone capture, second phone, dry-run draft), label it on screen. Never fake call audio.
- YouTube: burn in subtitles (autoplay is muted); title e.g. "Cortex: a second brain for Ray-Ban Meta glasses (HackUTA 2026)"; first line of the description should be the pitch line.
