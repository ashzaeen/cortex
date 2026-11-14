# apps/backend

Memory API and agent brain. Implements [contracts/openapi.yaml](../../contracts/openapi.yaml) as written, or changes it through the `contract-change` process in AGENTS.md.

**Stack: Proposed, not chosen.** The backend lead decides in [ADR 0001](../../docs/decisions/0001-backend-stack.md) (Python FastAPI or TypeScript) and [ADR 0002](../../docs/decisions/0002-data-store.md) (MongoDB Atlas or Postgres with pgvector). Until then this folder holds only the planned layout:

| Folder | Will hold |
| --- | --- |
| `api/` | HTTP routes for every contract endpoint, plus the `GET /events` SSE stream |
| `memory/` | Ingest pipeline (transcript, caption, snapshot, embedding), store, search with source moments, delete |
| `skills/` | Network (introductions), waiting-on promise detection, pre-meeting brief, ask with proof |
| `actions/` | Follow-up email: propose, confirm (send or draft), undo, receipts |
| `tests/` | Contract tests against `fixtures/`, and the done-when tests for T0-1 to T0-7 and T0-9 |

## Plugging into the root Makefile

Add `apps/backend/Makefile` with `setup`, `test`, `lint` and `seed` targets. `seed` must load `fixtures/*.json`. The root `make dev` uses the mock unless `CORTEX_API_URL` points at this service.
