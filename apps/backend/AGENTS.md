# apps/backend: agent notes

- **Owns:** memory API, skills (Network, waiting-on, brief, ask), action loop, privacy and the event stream. Label `area:backend`. Owner: @ClosetCoderSad (backend lead).
- **Stack:** not chosen. Do not pick a language, framework or data store; ADRs 0001 and 0002 are the backend lead's call. You may add evidence to the ADRs.
- **Run alone:** once scaffolded, run it against a local store loaded with `make seed`. Until then, other areas use the mock (`make mock`).
- **Contract:** [contracts/openapi.yaml](../../contracts/openapi.yaml). Every response must validate against `contracts/schemas/`. Answers come only from retrieved moments; otherwise `grounded: false`.
- **Done-when tests (from docs/PLAN.md):**
  - T0-1: a spoken sentence plus an object produces a stored moment within a few seconds.
  - T0-2: asking about something from earlier returns the right moment, every time, on the seeded data.
  - T0-3: "This is Ash from Acme" gives a correct card with the moment linked.
  - T0-4: a spoken promise becomes a tracked item with who, what and due date.
  - T0-5: a voice question gets a spoken answer and a receipt with the source moment.
  - T0-6: "Brief me on Ash" returns a correct 20-second brief.
  - T0-7: propose, confirm, send or save a draft, then a receipt with undo.
  - T0-9: pause or off-the-record, and delete a moment, including derived data.
- **Rules:** no face recognition; people enter only by introduction or consent; deletion removes embeddings and derived notes; `EMAIL_DRY_RUN=true` by default.
