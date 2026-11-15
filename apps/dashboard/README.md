# apps/dashboard

Companion web app: **Live, Capture, Timeline, Ask, Receipts, Privacy**. The glasses have no display, so this is where the wearer and the judges see memory working. Designed for iPhone Safari first; the same app on the laptop is the judges' view.

**Stack ([ADR 0005](../../docs/decisions/0005-dashboard-stack.md), Accepted):** Next.js 16 with TypeScript, Tailwind CSS 4, a same-origin `/api` proxy to `CORTEX_API_URL`, a stateful mock in `mock/`, Vercel hosting (#38). The UI is a working placeholder: plain Tailwind for now, with shadcn/ui and a design pass to come.

## Run it

```sh
make dev          # from the repo root: stateful mock on :4010 + dashboard on :3000
```

Open http://localhost:3000. On a phone on the same wifi, open `http://<laptop IP>:3000`. The camera and mic need HTTPS on iPhone, so use the Vercel URL for those.

Other commands, from this folder:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dashboard only (expects an API at `CORTEX_API_URL`, default `http://127.0.0.1:4010`) |
| `npm run mock` | Stateful mock only |
| `npm test` | Runs the Ash script against the mock and checks every response against `contracts/schemas/` |
| `npm run typecheck` | TypeScript check (`make lint` runs it) |
| `npm run types` | Regenerates `lib/api-types.ts` from `contracts/openapi.yaml`; run it after a contract change |
| `npm run build` | Production build |

`MOCK=prism make dev` uses the plain Prism mock instead (canned answers, no live events).

## Rehearse the Ash script

The Live tab has a **Demo driver** card, available only with the mock:

- **Next step** runs one beat: Meet, Promise, confirm, Ask, Brief, Act (propose and send the email), then the FaceTime call. Each step says what *you* would do, and you can do it yourself in the UI instead of pressing Next.
- **Play all** runs the rest on a timer (2.5 s per step).
- **Reset** reloads the fixtures and clears everything.

You can also type into **Say something** to simulate capture: "This is Ash from Acme." creates a contact card, and "I'll send you the deck Friday." creates a promise chip.

## Layout

| Path | What |
| --- | --- |
| `app/page.tsx` | App shell, header with capture state, bottom tab bar |
| `components/tabs.tsx` | Live, Timeline, Ask, Receipts and Privacy tabs |
| `components/CaptureTab.tsx` | Phone capture (#4): camera snapshot plus what was said, posted as a `phone` moment |
| `components/ui.tsx` | Placeholder primitives (Card, Button, Section) plus `speak()` |
| `app/api/[...path]/route.ts` | Proxy to `CORTEX_API_URL`; streams, so `/api/events` (SSE) works |
| `lib/api.ts` | Typed API client |
| `lib/useCortex.ts` | Loads data, listens to `/api/events`, refreshes on change, builds the Activity feed |
| `lib/api-types.ts` | Generated from the contract; do not edit by hand |
| `mock/server.mjs` | Stateful mock (#37): fixtures, fake skills, SSE, demo driver |
| `mock/test.mjs` | Contract test for the mock |

## The mock is not the backend

`mock/server.mjs` fakes the skills with simple text rules ("This is X from Y", "I'll send you X Friday", keyword search). It exists so the dashboard can be built and rehearsed now. It must never grow into the real backend, which is @ClosetCoderSad's call (ADR 0001). Mock-only extras that the real backend will not have: `/_demo/*`, the `demo.step` event, and static files under `/fixtures/`.

| Screen | Endpoints | Tier 0 |
| --- | --- | --- |
| Live | `GET /events`, `GET /privacy`, `GET /promises`, `GET /actions`, `GET /people`, `GET /people/{id}/brief` | T0-3, T0-4, T0-6, T0-8 |
| Capture | `POST /moments` (source `phone`), `GET /privacy` | T0-1 (fallback) |
| Timeline | `GET /moments`, `DELETE /moments/{id}` | T0-8, T0-9 |
| Ask | `POST /ask` (shows sources) | T0-5 |
| Receipts | `GET /receipts`, `POST /actions/{id}/undo` | T0-7 |
| Privacy | `POST /privacy/pause` | T0-9 |
