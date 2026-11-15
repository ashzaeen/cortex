# Cortex

A second brain for Ray-Ban Meta Gen 1 glasses: it remembers what you see and hear, answers with proof, and follows through on actions you approve. Built for HackUTA 2026 (main track and the Chert Best Use of FaceTime track).

**Start here:** [AGENTS.md](AGENTS.md) (rules for humans and agents), then [docs/STATUS.md](docs/STATUS.md) (what works).

## Quick start

Needs Node 24+, GNU Make and the GitHub CLI.

```sh
make setup    # install repo tooling and any area dependencies
make dev      # stateful mock API on :4010 + the dashboard on :3000 (Ash demo driver on the Live tab)
make check    # lint, contract validation, tests, status and secret checks
make status   # demo checklist status and open checklist issues
```

Every area runs alone against the mock API at `http://localhost:4010` and the seed data in `fixtures/`. `make mock` serves the plain Prism mock straight from the contract.

## Live

- Dashboard: https://cortex-dashboard-seven.vercel.app (deploys on every push to `main`); browser-only demo profile at `/demo`
- API: https://api-production-47227cba.up.railway.app (`/health`; real Atlas, Tiger Data and Gemini; redeploy by hand, see [apps/backend/README.md](apps/backend/README.md))

## Layout

| Path | What |
| --- | --- |
| `contracts/` | OpenAPI contract and JSON Schemas shared by all areas |
| `apps/backend/` | Memory API and agent brain (FastAPI, MongoDB Atlas, Tiger Data, Gemini; ADRs 0001 and 0002) |
| `apps/dashboard/` | Companion web app, iPhone first (Next.js, ADR 0005) |
| `apps/capture/` | Native iOS glasses capture app, plus the phone fallback (ADR 0003) |
| `apps/call-agent/` | Chert and LiveKit call agent (Node, Gemini Live) |
| `fixtures/` | Fake seed data used by every area |
| `scripts/` | Status, seed, checks and GitHub label setup |
| `docs/` | Product, plan, demo script, architecture, status, risks, ADRs |

Source documents (never edit): the PRD and the priority plan in the repo root.
