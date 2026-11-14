# scripts

Repo-wide helpers, called by the root Makefile. Node 24 only (stdlib plus the pinned dev dependencies in the root `package.json`), so they work on macOS, Linux and Windows.

| Script | Make target | What it does |
| --- | --- | --- |
| `dev.mjs` | `make dev` | Mock API on :4010, plus the dashboard if `apps/dashboard/package.json` exists |
| `check-contracts.mjs` | `make test` | Schemas compile; fixtures and openapi examples validate; ids resolve; required endpoints exist |
| `check-status.mjs` | `make test` | docs/STATUS.md has T0-1 to T0-11 once each, valid states, and a verifier for every `works` row |
| `check-repo.mjs` | `make lint` | No `.env` files or likely secrets tracked; relative Markdown links resolve |
| `areas.mjs` | `setup`, `lint`, `test` | Runs the target in each `apps/<area>/Makefile`, or prints that the area is a stub |
| `seed.mjs` | `make seed` | Validates fixtures, then runs `make -C apps/backend seed` when the backend exists |
| `status.mjs` | `make status` | Prints the Tier 0 table and the open `tier:0` issues |
| `setup-github.mjs` | `make github-setup` | Creates or updates labels and milestones (safe to re-run) |
| `lib.mjs` | - | Shared helpers |
