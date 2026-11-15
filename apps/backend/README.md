# apps/backend

Memory API and agent brain. Implements [contracts/openapi.yaml](../../contracts/openapi.yaml) exactly: same paths, bodies and response shapes. A test fails if the app gains or loses an operation compared with the contract.

**Stack (ADR 0001):** Python 3.11+, FastAPI, sync handlers. **Store (ADR 0002):** MongoDB Atlas for memory (moments, people, promises, actions, receipts, embeddings with Atlas Vector Search), Tiger Data (Postgres + TimescaleDB) for the time index and audit log. **Models:** Gemini (perception, embeddings, grounded answers, brief, email draft).

## Run

```sh
make setup                      # from the repo root: creates apps/backend/.venv
cp apps/backend/.env.example apps/backend/.env   # then fill DATABASE_URL, LLM_API_KEY, TIGER_DATABASE_URL in the root .env
make seed                       # loads fixtures/*.json (ids kept)
make -C apps/backend dev        # http://localhost:8000  (docs at /docs)
CORTEX_API_URL=http://localhost:8000 make dev   # dashboard against the real backend
```

**Hosted (#42):** https://api-production-47227cba.up.railway.app, Railway project `cortex-api`, service `api`. It builds `apps/backend/Dockerfile` from the repo root (it needs `contracts/` and `fixtures/`; Railway has `RAILWAY_DOCKERFILE_PATH=apps/backend/Dockerfile` set) and runs **one** uvicorn worker, because the SSE broker and undo timers live in process memory (`railway.json`: `/health` check, one replica). Keys live only in Railway variables; email runs with `EMAIL_DRY_RUN=true`. **Deploys:** CI redeploys Railway after `make check` passes on `main`, when `apps/backend/`, `contracts/`, `fixtures/`, `railway.json` or `.dockerignore` changed (needs the `RAILWAY_TOKEN` repo secret, a Railway project token for `cortex-api` production). By hand: `railway up --ci --service api` from a clean checkout of `main`, then check `/health`. Snapshots and videos live in MongoDB (videos as 4 MB chunks); the container disk is only a cache. Its database holds the demo seed, so run tests that write against a separate database.

**Offline (no keys, no network):** leave `DATABASE_URL` and `LLM_API_KEY` empty, or set `USE_MONGOMOCK=true LLM_MOCK=true`. Memory is in-process and lost on restart, so the server loads `fixtures/` itself at startup (`SEED_ON_START=false` to skip).

**Tests:** `make test` (root) or `make -C apps/backend test`. Offline: mongomock + a rule-based mock LLM. Every response is validated against `contracts/`.

## Layout

| Folder | Holds |
| --- | --- |
| `api/` | `routes.py`: every contract operation plus `GET /events` (SSE); `models.py`: request bodies |
| `memory/` | `ingest.py` (POST /moments pipeline), `search.py` (vector + freshness merge), `store.py`, `delete.py` (cascade) |
| `skills/` | `network.py` (introductions), `promises.py` (waiting-on chips), `brief.py`, `ask.py` (grounded answers) |
| `actions/` | `followup.py` (propose, confirm send/draft, undo; dispatches other types), `email.py` (dry run, SMTP, Resend), `doers.py` (calendar_event, reminder, flashcards, notes, message, read_aloud), `google.py` (Calendar, Tasks, Drive with the forwarded `X-Google-Access-Token`), `chert.py` (texts from the Chert line) |
| `core/` | config, MongoDB, Tiger Data, Gemini + mock, prompts, SSE broker, receipts, contract serializers, snapshots and short videos |
| `scripts/seed.py` | `make seed` loader for `fixtures/*.json` |
| `tests/` | contract tests and the done-when tests for T0-1 to T0-7 and T0-9 |

## How Tier 0 maps to code

| Id | Behaviour | Code |
| --- | --- | --- |
| T0-1 | `POST /moments` stores transcript, caption (Gemini vision), snapshot, embedding; 201 with the moment; 409 when paused | `memory/ingest.py` |
| T0-2 | `GET /moments/search` returns source moments; recent moments are always merged in because Atlas Search indexes update asynchronously | `memory/search.py` |
| T0-3 | "This is Ash from Acme" creates `per_ash` linked to the moment; later moments within 5 minutes link to Ash too | `skills/network.py` |
| T0-4 | Spoken promise becomes a `proposed` promise (confirm chip) with who, what, due; vague dates keep `date: null` | `skills/promises.py` |
| T0-5 | `POST /ask`: promise questions answered from the promises table; others by search + Gemini with citations checked; else `grounded: false`. Every answer writes a receipt | `skills/ask.py` |
| T0-6 | `GET /people/{id}/brief`: Gemini writes it from stored data; a template from the same data is the fallback; cached until the person's data changes. `POST /ask` "Brief me on Ash" returns it too | `skills/brief.py` |
| T0-7 | Confirming a promise auto-proposes the follow-up email (`action.proposed`). Confirm `send` holds delivery until the undo window (30 s) closes; undo cancels it. `EMAIL_DRY_RUN=true` saves a draft instead | `actions/followup.py` |
| T0-9 | `POST /privacy/pause` (paused, off_record) blocks ingest with 409; `DELETE /moments/{id}` removes the moment, embedding, snapshot, derived promises, people it introduced, its Tiger row, and returns a deletion receipt | `memory/store.py`, `memory/delete.py` |

## Notes for other areas

- **Capture:** post one finished utterance per `POST /moments`, with a JPEG in `snapshot_base64` or a MOV/MP4 clip of at most 10 seconds in `video_base64`. For questions, call `POST /ask` with `channel: voice`; "Brief me on Ash" works through `/ask` as well.
- **Dashboard:** `GET /events` sends `moment.created`, `person.created`, `promise.proposed`, `promise.confirmed`, `action.proposed`, `action.updated`, `receipt.created`, `privacy.changed`, `moment.deleted`. New snapshots are absolute URLs served by `GET /snapshots/{name}`; fixture snapshots stay repo-relative and are also served at `GET /fixtures/snapshots/{name}` (both routes are outside the contract; see the contract-change issue).
- **Call agent:** `POST /moments` with `source: call` also writes a `capture` receipt; then `POST /ask` with `channel: call`.
- **Speaker attribution:** transcripts have no speaker labels, so "I'll send you the deck" is attributed to the person the wearer was just introduced to. An optional `speaker` field in `MomentIngest` would remove the guess (proposed as an additive contract change).
