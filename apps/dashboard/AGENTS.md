# apps/dashboard: agent notes

- **Owns:** the web dashboard. Label `area:dashboard`. Owner: @ashzaeen.
- **Stack:** Proposed Next.js with TypeScript; confirm it in the first dashboard issue before scaffolding. Add `apps/dashboard/Makefile` (`setup`, `test`, `lint`) and a `dev` npm script so the root `make dev` picks it up.
- **Run alone:** `make dev` (mock API at `http://127.0.0.1:4010`). Never require the real backend to render. Read the API base URL from `CORTEX_API_URL`.
- **Contract:** [contracts/openapi.yaml](../../contracts/openapi.yaml); live updates come from `GET /events` (SSE). Generate types from the contract rather than writing them by hand.
- **Done-when test (T0-8):** updates appear on screen within seconds while the demo runs (Live, Timeline, Ask, Proof receipts). The dashboard also shows the T0-3 card, the T0-4 confirm chip, the T0-5 receipt, the T0-7 undo and the T0-9 controls.
- **Rules:** every answer shows its source moment; capture state is always visible; delete is one tap and gives a receipt.
