# apps/dashboard

Companion web app: **Live, Timeline, Ask, Proof receipts, Modes, Privacy**, plus the phone capture screen. The glasses have no display, so this is where the wearer and the judges see memory working. Designed for iPhone Safari first; the same app on the laptop is the judges' view.

**Stack: Accepted in [ADR 0005](../../docs/decisions/0005-dashboard-stack.md).** Next.js with TypeScript, Tailwind CSS with shadcn/ui, a same-origin `/api` proxy to `CORTEX_API_URL`, a stateful mock in `mock/` (#37), deployed on Vercel (#38). Not scaffolded yet.

## Run it alone

The dashboard needs only the mock API. `make dev` starts the mock at `http://127.0.0.1:4010` and, once `apps/dashboard/package.json` exists, runs `npm run dev` here with `CORTEX_API_URL` set. Read data over REST, and subscribe to `GET /events` (Server-Sent Events) for live updates.

| Screen | Endpoints | Tier 0 |
| --- | --- | --- |
| Live | `GET /events`, `GET /privacy`, pending promises and actions | T0-8 |
| Timeline | `GET /moments` | T0-8 |
| Ask | `POST /ask` (shows sources) | T0-5 |
| Proof receipts | `GET /receipts`, `POST /actions/{id}/undo` | T0-7 |
| Modes | `GET /modes` | - |
| Privacy | `POST /privacy/pause`, `DELETE /moments/{id}` | T0-9 |

`screens/` is a placeholder for the planned screens.
