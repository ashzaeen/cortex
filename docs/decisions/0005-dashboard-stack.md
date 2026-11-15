# 0005: Dashboard stack

- **Status:** Accepted (2026-11-14)
- **Decider:** dashboard owner (@ashzaeen)
- **Issue:** #20, #37, #38
- **Date:** 2026-11-14

## Context
The glasses have no display, so the dashboard is where the wearer and the judges see Cortex work (D-8). The team is iPhone-first but does not want an iOS app for the dashboard. The page must run on an iPhone in Safari and on a laptop on the projector, and must work on the mock before the backend exists.

## Decision
| Question | Choice |
| --- | --- |
| Platform | One responsive web app, designed for iPhone first; the same app on the laptop is the judges' view. Add a home-screen manifest so it opens full screen. |
| Framework | Next.js with TypeScript (App Router). |
| UI | Tailwind CSS with shadcn/ui. |
| API access | Same-origin `/api/*` proxy in the Next.js app, forwarding to `CORTEX_API_URL` (mock or real backend). The browser never calls the backend directly. |
| Mock | A stateful mock with a demo driver in `apps/dashboard/mock/`: loads `fixtures/`, keeps what is posted, streams `GET /events`, and can replay the Ash script. Dev-only; follows `contracts/openapi.yaml`. Prism stays for contract checks. |
| Hosting | Vercel: an HTTPS URL on every push to `main`, which iPhone Safari needs for the camera and mic. |
| Types | Generated from `contracts/openapi.yaml` (openapi-typescript), not written by hand. |

Options considered and rejected: a native iOS app for everything (slower to change, Swift for everyone); Vite single-page app (needs its own proxy and host); Tailwind without components (slower); direct browser calls to the backend (CORS and mixed-content problems); Prism only (no state or live events); laptop plus tunnel hosting (one more thing to keep alive on stage).

## Consequences
- Safari limits to design around: HTTPS for camera and mic; audio plays only after a tap, so a "Start Cortex" button unlocks it; capture stops when the screen locks, so use the Wake Lock API; transcribe on the backend, not with browser speech recognition.
- Venue wifi: Vercel needs a connection, so bring a phone hotspot (see the priority plan's fallbacks).
- The stateful mock is throwaway: it must not grow into the backend. The backend lead's choice (ADR 0001) is unaffected.
- `make dev` runs the stateful mock and the dashboard together once the dashboard has a `dev` script.
