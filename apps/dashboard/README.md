# apps/dashboard

Companion web dashboard: **Live, Timeline, Ask, Proof receipts, Modes, Privacy.** The glasses have no display, so this is where judges see memory working.

**Stack: Proposed, Next.js with TypeScript.** Not scaffolded yet. The dashboard owner confirms the stack in the first dashboard issue.

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
