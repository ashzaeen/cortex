# AGENTS.md: read this first

Every coding agent and every human starts here. `CLAUDE.md` only imports this file.

## What Cortex is

Cortex is a second brain for Ray-Ban Meta Gen 1 glasses plus a companion dashboard. It remembers what the wearer sees and hears, answers from that memory with proof (the source moment), and takes follow-up actions the user approves. Modes (Focus, Student, Life, Assist) are presets over one shared memory. Calls come in over FaceTime through Chert, which bridges into a LiveKit room our own agent joins. The glasses have no display, so output is audio plus the dashboard.

**Goal:** win the HackUTA 2026 main track and the Chert Best Use of FaceTime track with one flawless 3-minute demo:
Meet Ash → Ash's promise is tracked → ask with proof → spoken brief → approved follow-up email with undo → FaceTime finale where the caller's camera is saved and Cortex answers from memory. Full script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

**Before any task, read the two source-of-truth files in the repo root:**
- PRD: [Project Cortex - Product Concept for HackUTA 2026.md](Project%20Cortex%20-%20Product%20Concept%20for%20HackUTA%202026.md)
- Priority plan: [Cortex Core Priority Plan - Flawless Demo.md](Cortex%20Core%20Priority%20Plan%20-%20Flawless%20Demo.md)

For any UI work, also read [design.md](design.md) (the Brass design system, source of truth for look, feel and motion) and the reference mockup in [docs/design/](docs/design/).

Never edit, move or rewrite those two files. Where anything else disagrees with them, they win; record the conflict in [docs/RISKS.md](docs/RISKS.md).

## Priorities

There are no tiers and no gating (decided 2026-11-15): any feature in the feature spec can be built at any time. The **demo checklist** (D-1 to D-11) in [docs/PLAN.md](docs/PLAN.md) lists what the 3-minute demo needs on stage, and its state is in [docs/STATUS.md](docs/STATUS.md). Issues for those items carry the `demo-checklist` label. Pick work by what helps the demo and the team most.

## Where truth lives

| Question | Source of truth |
| --- | --- |
| What work exists, who owns it | GitHub issues (`gh issue list`) |
| What works right now | [docs/STATUS.md](docs/STATUS.md) |
| Interfaces between areas | [contracts/](contracts/) (`openapi.yaml` plus JSON Schemas) |
| Decisions | [docs/decisions/](docs/decisions/) (ADRs) |
| Product and priorities | The PRD and priority plan above |

If code and a document disagree, fix the document in the same commit.

## Area map

| Area | Path | Label | Owner |
| --- | --- | --- | --- |
| Contracts | `contracts/` | `area:contracts` | @ClosetCoderSad (backend lead) |
| Backend: memory API and agent brain | `apps/backend/` | `area:backend` | @ClosetCoderSad (backend lead) |
| Dashboard | `apps/dashboard/` | `area:dashboard` | @ashzaeen |
| Capture: glasses and phone | `apps/capture/` | `area:capture` | @794KHSameer (hardware and Meta glasses lead); iOS app (`apps/capture/glasses/`, everything iOS): @ahnafzabir-utd |
| Call agent: Chert and LiveKit | `apps/call-agent/` | `area:call` | @ahnafzabir-utd (Chert lead) |
| Demo: fixtures, script, rehearsal | `fixtures/`, `docs/DEMO_SCRIPT.md` | `area:demo` | @ashzaeen |
| Infra: tooling, CI, scripts | `Makefile`, `scripts/`, `.github/` | `area:infra` | @ashzaeen |

Owners are also in [.github/CODEOWNERS](.github/CODEOWNERS). Each area has its own `README.md` and `AGENTS.md`; read the one for the area you touch.

**Stay in your area.** Change files only in the area your issue is labeled for, unless the issue says otherwise. If you need a change elsewhere, open an issue with that area's label and describe what you need. Do not edit another area silently.

## Session start ritual

1. Read this file and [docs/STATUS.md](docs/STATUS.md).
2. Run `make status` (or `gh issue list --label demo-checklist --state open`).
3. Read the issues assigned to your person: `gh issue list --assignee <handle>`.
4. `git pull` on `main` before you change anything.

## Claim protocol

1. Pick an open issue labeled `agent-ready` in your area; `demo-checklist` issues are a good place to start.
2. Assign it to your person (`gh issue edit <n> --add-assignee <handle>`), add `status:in-progress`, and comment `Claiming`.
3. **No branches, no PRs.** Everyone works on `main` locally and pushes to `main`. One issue at a time; small commits that mention the issue (`#<n>`).

## How to push (every time)

1. Commit your work locally.
2. `git pull` (merges everyone else's work). Resolve any conflicts, keeping the other person's changes unless you are sure; if a conflict is in another area, ask that area's owner on the issue instead of guessing.
3. `make check`. It must pass **after** the merge. If it fails, fix it before pushing; never push a red `main`.
4. `git push`. If it is rejected because someone pushed first, repeat from step 2.
5. Never `git push --force` (it is blocked on `main` anyway) and never rewrite pushed history.

## Definition of done

- The issue's done-when test passes, and you comment on the issue with **How I verified this** (exact commands, steps, output).
- `make check` passes (lint, contract validation, tests, status and secret checks).
- [docs/STATUS.md](docs/STATUS.md) is updated in the same push: state, last verified (date and who), notes.
- `contracts/` is updated if any interface changed (see Contract changes).
- The commit that finishes the issue says `Closes #<n>` in its message (GitHub closes the issue when it reaches `main`).

## How agents communicate

GitHub is the shared brain. Never message another agent outside GitHub; leave everything the next agent needs in an issue, a commit message or STATUS.md.

- Questions and handoffs go in issue comments, using this template:

  ```
  **Done:**
  **Not done:**
  **Next step:**
  **Gotchas:**
  **How to verify:**
  ```
- `needs-human`: only a person can decide or act (verify a phone by iMessage, get hardware, accept an ADR, enter a key). Say exactly what the human must do.
- `status:blocked`: you cannot continue; name the blocking issue (`Blocked by #<n>`).
- To reach another area, comment with its label (for example `area:backend`) and mention its owner.

## Contract changes

Before you push any change to `contracts/`, open or use an issue labeled `contract-change` that lists the affected areas and mentions each affected owner, and reference it in the commit. Update the fixtures and the mock so `make check` still passes. Never break a contract silently. Additive changes (new optional fields) are preferred over renames.

## Decisions

Record non-trivial decisions as ADRs in [docs/decisions/](docs/decisions/) with status Proposed, Accepted or Superseded. The backend stack (ADR 0001) and data store (ADR 0002) are the backend lead's call; agents may add options and evidence but never mark them Accepted.

## Session end ritual

1. Comment on the issue with the handoff template.
2. Update [docs/STATUS.md](docs/STATUS.md) if anything changed state.
3. Pull, run `make check`, and push to `main` (see How to push).

## Safety and trust rules

- No real personal data in `fixtures/` or tests. Fake names, fake companies, placeholder snapshots. The public demo profile (`apps/dashboard/demo/`) may use freely licensed stock photos, credited in `apps/dashboard/public/demo-snaps/CREDITS.md`; anyone shown appears only under a fake name (decided by @ashzaeen, #44).
- Every captured moment is deletable, and deletion removes derived data too.
- No secrets in the repo. Keys live in `.env` (gitignored); `.env.example` lists the names only. Never paste keys into issues, commits or chat.

## Demo rules

- Never push anything to `main` that breaks the demo script or fails `make check`.
- `main` must always run `make dev` against the mock API.
- After feature freeze (see [docs/PLAN.md](docs/PLAN.md)), only bug fixes are pushed.

## Style

- Small changes. Tests for contracts and core logic.
- No placeholder success: never mark something `works` in STATUS.md that you did not run, and never stub a test to pass.
- Keep files short and useful.
