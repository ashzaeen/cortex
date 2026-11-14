# apps/dashboard: agent notes

- **Owns:** the web dashboard. Label `area:dashboard`. Owner: @ashzaeen.
- **Stack (ADR 0005, Accepted):** Next.js + TypeScript, Tailwind + shadcn/ui, same-origin `/api` proxy to `CORTEX_API_URL`, stateful mock in `mock/` (#37), Vercel (#38). iPhone Safari first: HTTPS for camera and mic, a tap to unlock audio, Wake Lock while capturing. Add `apps/dashboard/Makefile` (`setup`, `test`, `lint`) and a `dev` npm script so the root `make dev` picks it up.
- **Run alone:** `make dev` (stateful mock at `http://127.0.0.1:4010`, dashboard at `:3000`). Never require the real backend to render. The server reads the API base URL from `CORTEX_API_URL`; the browser only ever calls `/api/*`.
- **Mock (`mock/`):** fakes skills with text rules and has an Ash demo driver (`/_demo/*`). Keep it contract-true (`npm test` validates every response) and never let it grow into the backend.
- **Contract:** [contracts/openapi.yaml](../../contracts/openapi.yaml); live updates come from `GET /events` (SSE). Generate types from the contract rather than writing them by hand.
- **Done-when test (T0-8):** updates appear on screen within seconds while the demo runs (Live, Timeline, Ask, Proof receipts). The dashboard also shows the T0-3 card, the T0-4 confirm chip, the T0-5 receipt, the T0-7 undo and the T0-9 controls.
- **Rules:** every answer shows its source moment; capture state is always visible; delete is one tap and gives a receipt.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
