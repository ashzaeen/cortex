# apps/call-agent: agent notes

- **Owns:** the Chert and LiveKit agent. Label `area:call`. Owner: @ashzaeen.
- **Stack:** Node, LiveKit Agents and Gemini Live (ADR 0004 is still Proposed; the agent is built this way). Code is in `agent/`; Cortex API calls are in `agent/cortex.mjs`.
- **Run alone:** run the Cortex side against the mock (`make mock`). Real calls need a Chert line, our LiveKit project and a verified iPhone; those steps are `needs-human`.
- **Contract:** talk to Cortex only through [contracts/openapi.yaml](../../contracts/openapi.yaml): `POST /ask` (channel `call`), `GET /people/{id}/brief`, `POST /moments` (source `call`), `POST /calls/started` and `POST /calls/ended`. Never read the data store directly. Cortex calls must never throw or block a call: return a result and let the model say memory is unavailable.
- **Done-when test (D-10):** an iPhone FaceTime reaches Cortex, which greets within 10 s, answers from memory, and saves what the camera shows.
- **Rules:** never paste or commit Chert or LiveKit keys; do not start the Chert trial without a human's go-ahead in the issue; keep calls under 5 minutes.
