# Risks, open TODOs and source conflicts

Live risk list. The demo fallbacks table lives in the [priority plan](../Cortex%20Core%20Priority%20Plan%20-%20Flawless%20Demo.md).

## Top risks

| Risk | Impact | Mitigation | Issue |
| --- | --- | --- | --- |
| Meta toolkit does not deliver camera frames on Gen 1 glasses | T0-1 | Phone capture fallback posting to the same `POST /moments` ([ADR 0003](decisions/0003-capture-path.md)) | #2, #4 |
| Caller camera frames: how they reach our code is unverified | T0-10 | Read Chert's video guide first (`chert guide video`) | #5 |
| Chert trial clock: the plan says not to start the trial early | T0-10 | See note below; confirm how the track's free 48-hour line is issued | #6 |
| No team iPhone confirmed for iMessage verification | T0-10 | Confirm a teammate's iPhone in M0 (`needs-human`) | #6, #12 |
| Chert limits: 5-minute calls, one call per line, greet within 10 s, connector must stay running | Demo | Call beat fits in 60 s; laptop hosts agent and connector; greeting test in M0 | #11 |
| Latency of speech, vision and answers | Demo | Pre-compute and cache the brief and Priya answers before going on stage | #23 |
| Retrieval hallucination | Trust | Answer only from retrieved moments; say "I don't have that" otherwise | #14, #17 |
| Venue wifi | Demo | Phone hotspot, seeded data cached locally | #23 |
| Scope creep | Demo | Tier rule in AGENTS.md; feature freeze 6 h before judging | - |

**Chert trial note (2026-11-14):** a Chert onboarding (`onboard --plan trial --stack demo`) was started from @ashzaeen's machine before this repo existed. Browser sign-in completed and a Chert project was created, but phone verification was not finished and the process was stopped. Check with `chert onboard --status` and in the Chert console whether the trial clock has started, before relying on the 48-hour window.

## Open TODOs (setup)

- Teammates' GitHub handles are TODO in [.github/CODEOWNERS](../.github/CODEOWNERS), [AGENTS.md](../AGENTS.md) and each area's AGENTS.md. Invite them as collaborators and replace the TODOs.
- GitHub Project board was skipped: the `gh` token lacks the `project` scope. To add it: `gh auth refresh -s project`, then create a board with columns Backlog, Ready, In progress, In review, Done.
- Branch protection on `main` (require a PR and passing CI): see the status line below.

Branch protection: TODO (set at the end of repo setup).

## Where this setup differs from the source files (the files win)

1. **Demo script.** The PRD's demo section (Student, Life and Assist beats, keys on a table) differs from the priority plan's hero demo (Priya flow plus FaceTime finale). The plan is newer and the setup brief matches it, so [DEMO_SCRIPT.md](DEMO_SCRIPT.md) follows the plan.
2. **Scope.** The PRD's "Must ship" list (three modes, calendar and task actions, daily digest) is larger than the plan's Tier 0 (one email action; digest and second mode are Tier 1). The plan's tiers are used.
3. **Stack.** The PRD's technical stack table names Postgres with pgvector, Next.js, native Swift or Kotlin, and AWS. The setup brief says not to lock the stack, so these appear as options in ADRs 0001 to 0004, all Proposed.
4. **Go/no-go checks.** The plan has checks the brief did not list: a greeting within 10 s in a test call, and the demo phone verified for outbound calls and texts. Both were added as M0 spikes.
5. **Cut list.** The plan also cuts "Assist beyond a simple read-aloud" and keeps "Ask the world" out unless it comes free from search; [PLAN.md](PLAN.md) includes both.
6. **Priya's history.** The PRD's brief example ("You met at the career fair on Oct 3") implies earlier Priya data, while the hero demo meets Priya live. Fixtures seed earlier days with other people only and leave Priya to be created live; the demo owner decides whether to seed earlier Priya moments.
7. **Roles.** The PRD lists four roles (pipeline, perception and memory, agent and modes, dashboard and demo); the repo has five areas because the call agent is its own area. Map owners when handles are known.
