# apps/backend: agent notes

- **Owns:** memory API, skills (Network, waiting-on, brief, ask), action loop, privacy and the event stream. Label `area:backend`. Owner: @ClosetCoderSad (backend lead).
- **Stack:** Python 3.11+ with FastAPI ([ADR 0001](../../docs/decisions/0001-backend-stack.md)); MongoDB Atlas for memory plus Tiger Data for the time index ([ADR 0002](../../docs/decisions/0002-data-store.md)); Gemini for models. Do not switch stacks without a new ADR.
- **Run alone:** `make -C apps/backend dev` (port 8000) after `make seed`. Offline: leave `DATABASE_URL` and `LLM_API_KEY` empty (in-memory store, mock model).
- **Contract:** [contracts/openapi.yaml](../../contracts/openapi.yaml). `tests/` validates every response against `contracts/` and fails if the app's operations differ from the contract. Answers come only from retrieved moments; otherwise `grounded: false`.
- **Done-when tests (from docs/PLAN.md):** automated offline versions live in `tests/test_done_when.py`. They do not replace the real test (spoken sentence through capture, real Gemini, real Atlas) required before STATUS.md says `works`.
  - D-1: a spoken sentence plus an object produces a stored moment within a few seconds.
  - D-2: asking about something from earlier returns the right moment, every time, on the seeded data.
  - D-3: "This is Ash from Acme" gives a correct card with the moment linked.
  - D-4: a spoken promise becomes a tracked item with who, what and due date.
  - D-5: a voice question gets a spoken answer and a receipt with the source moment.
  - D-6: "Brief me on Ash" returns a correct 20-second brief.
  - D-7: propose, confirm, send or save a draft, then a receipt with undo.
  - D-9: pause or off-the-record, and delete a moment, including derived data.
- **Rules:** deletion removes embeddings and derived notes; `EMAIL_DRY_RUN=true` by default. Keep handlers sync (FastAPI threads them); never call blocking SDKs inside `async def` routes.
