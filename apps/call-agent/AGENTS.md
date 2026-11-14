# apps/call-agent: agent notes

- **Owns:** the Chert and LiveKit agent. Label `area:call`. Owner: TODO handle.
- **Stack:** not chosen (ADR 0004: LiveKit Agents in Python or Node).
- **Run alone:** run the Cortex side against the mock (`make mock`). Real calls need a Chert line, our LiveKit project and a verified iPhone; those steps are `needs-human`.
- **Contract:** talk to Cortex only through [contracts/openapi.yaml](../../contracts/openapi.yaml): `POST /ask` (channel `call`), `GET /people/{id}/brief`, `POST /moments` (source `call`). Never read the data store directly.
- **Done-when test (T0-10):** an iPhone FaceTime reaches Cortex, which greets within 10 s, answers from memory, and saves what the camera shows.
- **Rules:** never paste or commit Chert or LiveKit keys; do not start the Chert trial without a human's go-ahead in the issue; keep calls under 5 minutes.
