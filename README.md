# Cortex

A second brain for Ray-Ban Meta Gen 1 glasses: it remembers what you see and hear, answers with proof, and follows through on actions you approve. Built for HackUTA 2026 (main track and the Chert Best Use of FaceTime track).

**Start here:** [AGENTS.md](AGENTS.md) (rules for humans and agents), then [docs/STATUS.md](docs/STATUS.md) (what works).

## Quick start

Needs Node 24+, GNU Make and the GitHub CLI.

```sh
make setup    # install repo tooling and any area dependencies
make dev      # stateful mock API on :4010 + the dashboard on :3000 (Ash demo driver on the Live tab)
make check    # lint, contract validation, tests, status and secret checks
make status   # Tier 0 status table and open Tier 0 issues
```

Every area runs alone against the mock API at `http://localhost:4010` and the seed data in `fixtures/`. `make mock` serves the plain Prism mock straight from the contract.

## Layout

| Path | What |
| --- | --- |
| `contracts/` | OpenAPI contract and JSON Schemas shared by all areas |
| `apps/backend/` | Memory API and agent brain (stack: Proposed, see ADR 0001) |
| `apps/dashboard/` | Companion web app, iPhone first (Next.js, ADR 0005) |
| `apps/capture/` | Native iOS glasses capture app, plus the phone fallback (ADR 0003) |
| `apps/call-agent/` | Chert and LiveKit call agent |
| `fixtures/` | Fake seed data used by every area |
| `scripts/` | Status, seed, checks and GitHub label setup |
| `docs/` | Product, plan, demo script, architecture, status, risks, ADRs |

Source documents (never edit): the PRD and the priority plan in the repo root.
