# Risks, open TODOs and source conflicts

Live risk list. The demo fallbacks table lives in the [priority plan](../Cortex%20Core%20Priority%20Plan%20-%20Flawless%20Demo.md).

## Top risks

| Risk | Impact | Mitigation | Issue |
| --- | --- | --- | --- |
| Meta toolkit does not deliver camera frames on Gen 1 glasses | D-1 | Phone capture fallback posting to the same `POST /moments` ([ADR 0003](decisions/0003-capture-path.md)) | #2, #4 |
| Native capture app needs a Mac with Xcode 26.4+ and an iPhone on iOS 17.2+. The iOS lead is @ahnafzabir-utd; confirm who has the Mac and whose iPhone runs it (@ashzaeen has none) | D-1 | Confirm a Mac and test iPhone on #36; build against Mock Device Kit first; the web phone capture stays as the fallback | #36, #39 |
| iPhone Safari limits: HTTPS for camera and mic, audio only after a tap, capture stops on screen lock | D-1, D-8 | Vercel HTTPS (#38), a Start button that unlocks audio, Wake Lock ([ADR 0005](decisions/0005-dashboard-stack.md)) | #37, #38 |
| Caller camera frames: how they reach our code is unverified | D-10 | Read Chert's video guide first (`chert guide video`) | #5 |
| Chert trial clock: the plan says not to start the trial early | D-10 | See note below; confirm how the track's free 48-hour line is issued | #6 |
| No team iPhone confirmed for iMessage verification | D-10 | Confirm a teammate's iPhone in M0 (`needs-human`) | #6, #12 |
| Chert limits: 5-minute calls, one call per line, greet within 10 s, connector must stay running | Demo | Call beat fits in 60 s; laptop hosts agent and connector; greeting test in M0 | #11 |
| Latency of speech, vision and answers | Demo | Pre-compute and cache the brief and Ash answers before going on stage | #23 |
| Retrieval hallucination | Trust | Answer only from retrieved moments; say "I don't have that" otherwise | #14, #17 |
| Venue wifi | Demo | Phone hotspot, seeded data cached locally | #23 |
| Scope creep | Demo | Demo checklist in PLAN.md keeps the stage needs visible; feature freeze 6 h before judging | - |
| Hosted backend is one in-memory process: a Railway restart drops SSE clients and any pending undo timer, and pushing to `main` does not redeploy it | Demo | Reconnect SSE in the dashboard; redeploy by hand (`railway up --ci --service api`) after backend changes and re-check `/health` before going on stage | #42 |
| The hosted database is the demo data: tests or experiments that write (intros, promises, deletes) pollute the stage run | Demo | Run write tests on a separate Atlas database; reseed with `make seed` before rehearsal | #23, #29 |
| The Chert line's number is in a public doc (`docs/CHERT_CALL_LAYER_HANDOFF.md`), so strangers can use up trial minutes | D-10 | Kept for now (@ashzaeen, 2026-11-14); watch the minutes in the Chert console, and remove it or ask Chert for a new line if they drop | #6, #22 |

**Chert trial note (2026-11-14):** a Chert onboarding (`onboard --plan trial --stack demo`) was started from @ashzaeen's machine before this repo existed. Browser sign-in completed and a Chert project was created, but phone verification was not finished and the process was stopped. Check with `chert onboard --status` and in the Chert console whether the trial clock has started, before relying on the 48-hour window.

## Open TODOs (setup)

- Owners: @ClosetCoderSad (backend, contracts), @ahnafzabir-utd (call), @794KHSameer (capture), @ashzaeen (dashboard, demo, infra; assumed from the PRD's "Dashboard and demo" role, change if wrong). Teammates must accept their collaborator invites before issues can be assigned to them and before CODEOWNERS review requests work.
- GitHub Project board was skipped: the `gh` token lacks the `project` scope. To add it: `gh auth refresh -s project`, then create a board with columns Backlog, Ready, In progress, In review, Done.
- Workflow: no branches or PRs; everyone pulls, merges locally, runs `make check` and pushes to `main` (team decision, 2026-11-14).

Branch protection on `main` (2026-11-14): direct pushes allowed; force pushes and branch deletion are blocked so nobody can wipe others' work. CI runs `make check` on every push; a red run means fix `main` first. Risk: a bad push can break `main` for everyone, so `make check` after `git pull` and before `git push` is mandatory.

## Where this setup differs from the source files (the files win)

1. **Demo script.** The PRD's demo section (Student, Life and Assist beats, keys on a table) differs from the priority plan's hero demo (Ash flow plus FaceTime finale). The plan is newer and the setup brief matches it, so [DEMO_SCRIPT.md](DEMO_SCRIPT.md) follows the plan.
2. **Scope (historical; tiers scrapped 2026-11-15, see PLAN.md).** The PRD's "Must ship" list (three modes, calendar and task actions, daily digest) is larger than the plan's Tier 0 (one email action; digest and second mode are Tier 1). The plan's tiers are used.
3. **Stack.** The PRD's technical stack table names Postgres with pgvector, Next.js, native Swift or Kotlin, and AWS. The setup brief said not to lock the stack, so these appeared as options in ADRs 0001 to 0004. Since then the team chose FastAPI (0001), MongoDB Atlas plus Tiger Data instead of Postgres with pgvector (0002), a native iOS capture app (0003) and Next.js on Vercel (0005), all Accepted, with the backend hosted on Railway rather than AWS (#42). 0004 (call agent, speech, models) is still Proposed, though the call agent is built on LiveKit Agents and Gemini Live.
4. **Go/no-go checks.** The plan has checks the brief did not list: a greeting within 10 s in a test call, and the demo phone verified for outbound calls and texts. Both were added as M0 spikes.
5. **Cut list.** The plan also cuts "Assist beyond a simple read-aloud" and keeps "Ask the world" out unless it comes free from search; [PLAN.md](PLAN.md) includes both.
6. **Ash's history.** The PRD's brief example ("You met at the career fair on Oct 3") implies earlier Ash data, while the hero demo meets Ash live. **Decided 2026-11-14 (@ashzaeen, #29): seed one earlier Ash meeting** (career fair, Nov 11) so the brief can say where you met. This conflicts with the priority plan's beat 1 and D-3 ("a contact card appears with the moment attached"): with Ash seeded, the live intro re-links the existing card. Beat 1 becomes a re-meeting, which needs `person.updated` and a backend change (#43) and team agreement on the frozen script (#30). Until #43 lands the fixture stays out of `main`, and Ash is created live.
7. **Roles.** The PRD lists four roles (pipeline, perception and memory, agent and modes, dashboard and demo); the repo has five areas because the call agent is its own area, owned by the Chert lead.
8. **Example name.** The PRD and plan use "Priya" as the person met in the demo. At the team's request every example in this repo uses **Ash** instead ("This is Ash from Acme"). The source files are unchanged; read Priya there as Ash.
