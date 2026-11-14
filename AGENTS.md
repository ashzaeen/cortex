# AGENTS.md: read this first

Every coding agent and every human starts here. `CLAUDE.md` only imports this file.

## What Cortex is

Cortex is a second brain for Ray-Ban Meta Gen 1 glasses plus a companion dashboard. It remembers what the wearer sees and hears, answers from that memory with proof (the source moment), and takes follow-up actions the user approves. Modes (Focus, Student, Life, Assist) are presets over one shared memory. Calls come in over FaceTime through Chert, which bridges into a LiveKit room our own agent joins. The glasses have no display, so output is audio plus the dashboard. No face recognition.

**Goal:** win the HackUTA 2026 main track and the Chert Best Use of FaceTime track with one flawless 3-minute demo:
Meet Ash → Ash's promise is tracked → ask with proof → spoken brief → approved follow-up email with undo → FaceTime finale where the caller's camera is saved and Cortex answers from memory. Full script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

**Before any task, read the two source-of-truth files in the repo root:**
- PRD: [Project Cortex - Product Concept for HackUTA 2026.md](Project%20Cortex%20-%20Product%20Concept%20for%20HackUTA%202026.md)
- Priority plan: [Cortex Core Priority Plan - Flawless Demo.md](Cortex%20Core%20Priority%20Plan%20-%20Flawless%20Demo.md)

Never edit, move or rewrite those two files. Where anything else disagrees with them, they win; record the conflict in [docs/RISKS.md](docs/RISKS.md).

## Priority rule

Tier 0 before anything else. Never work on a Tier 1 or Cut item while any Tier 0 item in [docs/STATUS.md](docs/STATUS.md) is not `works`. The tier list and ids (T0-1 to T0-11) are in [docs/PLAN.md](docs/PLAN.md). If an issue is labeled `tier:1` or `tier:cut`, do not start it unless a human says so in the issue.

## Where truth lives

| Question | Source of truth |
| --- | --- |
| What work exists, who owns it | GitHub issues (`gh issue list`) |
| What works right now | [docs/STATUS.md](docs/STATUS.md) |
| Interfaces between areas | [contracts/](contracts/) (`openapi.yaml` plus JSON Schemas) |
| Decisions | [docs/decisions/](docs/decisions/) (ADRs) |
| Product and priorities | The PRD and priority plan above |

If code and a document disagree, fix the document in the same PR.

## Area map

| Area | Path | Label | Owner |
| --- | --- | --- | --- |
| Contracts | `contracts/` | `area:contracts` | @ClosetCoderSad (backend lead) |
| Backend: memory API and agent brain | `apps/backend/` | `area:backend` | @ClosetCoderSad (backend lead) |
| Dashboard | `apps/dashboard/` | `area:dashboard` | @ashzaeen |
| Capture: glasses and phone | `apps/capture/` | `area:capture` | @794KHSameer (hardware and Meta glasses lead) |
| Call agent: Chert and LiveKit | `apps/call-agent/` | `area:call` | @ahnafzabir-utd (Chert lead) |
| Demo: fixtures, script, rehearsal | `fixtures/`, `docs/DEMO_SCRIPT.md` | `area:demo` | @ashzaeen |
| Infra: tooling, CI, scripts | `Makefile`, `scripts/`, `.github/` | `area:infra` | @ashzaeen |

Owners are also in [.github/CODEOWNERS](.github/CODEOWNERS). Each area has its own `README.md` and `AGENTS.md`; read the one for the area you touch.

**Stay in your area.** Change files only in the area your issue is labeled for, unless the issue says otherwise. If you need a change elsewhere, open an issue with that area's label and describe what you need. Do not edit another area silently.

## Session start ritual

1. Read this file and [docs/STATUS.md](docs/STATUS.md).
2. Run `make status` (or `gh issue list --label tier:0 --state open`).
3. Read the issues assigned to your person: `gh issue list --assignee <handle>`.
4. `git pull --rebase` on `main`, then rebase your branch on it.

## Claim protocol

1. Pick an open issue labeled `agent-ready` in your area, Tier 0 first.
2. Assign it to your person (`gh issue edit <n> --add-assignee <handle>`), add `status:in-progress`, and comment `Claiming`.
3. One issue per branch, named `issue-<number>-<short-slug>`. One PR per issue. Keep PRs small.

## Definition of done

- The issue's done-when test passes, and the PR description shows how you verified it ("How I verified this").
- `make check` passes (lint, contract validation, tests, status and secret checks).
- [docs/STATUS.md](docs/STATUS.md) is updated in the same PR: state, last verified (date and who), notes.
- `contracts/` is updated if any interface changed (see Contract changes).
- The PR body links the issue with `Closes #<n>`.

## How agents communicate

GitHub is the shared brain. Never message another agent outside GitHub; leave everything the next agent needs in an issue, PR or STATUS.md.

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

Any PR that touches `contracts/` needs the `contract-change` label, a list of affected areas, and a mention of each affected owner. Update the fixtures and the mock so `make check` still passes. Never break a contract silently. Additive changes (new optional fields) are preferred over renames.

## Decisions

Record non-trivial decisions as ADRs in [docs/decisions/](docs/decisions/) with status Proposed, Accepted or Superseded. The backend stack (ADR 0001) and data store (ADR 0002) are the backend lead's call; agents may add options and evidence but never mark them Accepted.

## Session end ritual

1. Comment on the issue with the handoff template.
2. Update [docs/STATUS.md](docs/STATUS.md) if anything changed state.
3. Push your branch and open or update the PR.

## Safety and trust rules

- No real personal data in `fixtures/` or tests. Fake names, fake companies, placeholder snapshots.
- No face recognition, ever. People enter memory only by introduction or consent.
- Every captured moment is deletable, and deletion removes derived data too.
- No secrets in the repo. Keys live in `.env` (gitignored); `.env.example` lists the names only. Never paste keys into issues, PRs or chat.

## Demo rules

- Nothing merges to `main` that breaks the Tier 0 demo script.
- `main` must always run `make dev` against the mock API.
- After feature freeze (see [docs/PLAN.md](docs/PLAN.md)), only bug fixes merge.

## Style

- Small changes. Tests for contracts and core logic.
- No placeholder success: never mark something `works` in STATUS.md that you did not run, and never stub a test to pass.
- Keep files short and useful.
