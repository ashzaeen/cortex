# apps/dashboard

Companion web app in the **Brass** design system ([design.md](../../design.md)). One Home screen - status pill, Timeline, the suggestion for the current mode, Ask Your Memory - with the mode dock and everything else as sheets. Designed for iPhone Safari first; on laptops the same app fits one screen and is the judges' view.

**Stack ([ADR 0005](../../docs/decisions/0005-dashboard-stack.md), Accepted):** Next.js 16 with TypeScript, Tailwind CSS 4 reading the Brass tokens in `app/globals.css`, Motion for springs and gestures, Lucide icons, three.js (lazy, pairing only), fonts self-hosted with `next/font`, a same-origin `/api` proxy to `CORTEX_API_URL`, a stateful mock in `mock/`, Vercel hosting (#38). Every component and state renders at `/styleguide`.

## Run it

```sh
make dev          # from the repo root: stateful mock on :4010 + dashboard on :3000
```

Open http://localhost:3000. On a phone on the same wifi, open `http://<laptop IP>:3000`. The camera and mic need HTTPS on iPhone, so use the Vercel URL for those.

## Deployed

**https://cortex-dashboard-seven.vercel.app** (Vercel project `cortex-dashboard`, root `apps/dashboard`). Every push to `main` deploys to production. `CORTEX_API_URL` is set in the Vercel project env, never in the repo; until a hosted API exists (#42) it is unset and `/api/*` returns 502 `api_unreachable`.

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

The **Demo driver** is hidden so judges never see it. Open http://localhost:3000/?demo=1, or turn it on in Settings and Privacy (tap the status pill). It works only with the mock:

- **Next step** runs one beat: Meet, Promise, confirm, Ask, Brief, Act (propose and send the email), then the FaceTime call. Each step says what *you* would do, and you can do it yourself in the UI instead of pressing Next.
- **Play all** runs the rest on a timer (2.5 s per step).
- **Reset** reloads the fixtures and clears everything.

To simulate capture by hand, open the camera button in the status pill and type into **What Was Said**: "This is Ash from Acme." creates a contact card, and "I'll send you the deck Friday." shows the Track It chip above the dock.

## Layout

| Path | What |
| --- | --- |
| `app/page.tsx` | Home: ambient light, status pill, Timeline, suggestion, Ask, mode dock, sheets, keyboard and swipe |
| `app/globals.css` | Brass tokens (design.md 19.2), glass, ambient, motifs, reduced motion |
| `app/styleguide/page.tsx` | Every component in every state |
| `components/brass/` | One file per component: `StatusPill`, `ModeDock`, `AskPanel`, `SuggestionCard`, `TimelinePanel`, `Sheet`, `Toast`, `sheets` (Ask, Moment, People, Waiting On, Settings, Receipts, Call), `CaptureSheet` (#4), `TimelineSheet` (3D contact sheet), `PairingSheet` + `Glasses3D`, `DemoPanel`, `Ambient`, `primitives` |
| `lib/format.ts` | Timecodes, short IDs, tags, due chips, light seeds, Title Case |
| `app/api/[...path]/route.ts` | Proxy to `CORTEX_API_URL`; streams, so `/api/events` (SSE) works |
| `lib/api.ts` | Typed API client |
| `lib/useCortex.ts` | Loads data, listens to `/api/events`, refreshes on change, builds the Activity feed |
| `lib/api-types.ts` | Generated from the contract; do not edit by hand |
| `mock/server.mjs` | Stateful mock (#37): fixtures, fake skills, SSE, demo driver |
| `mock/test.mjs` | Contract test for the mock |

## The mock is not the backend

`mock/server.mjs` fakes the skills with simple text rules ("This is X from Y", "I'll send you X Friday", keyword search). It exists so the dashboard can be built and rehearsed now. It must never grow into the real backend, which is @ClosetCoderSad's call (ADR 0001). Mock-only extras that the real backend will not have: `/_demo/*`, the `demo.step` event, and static files under `/fixtures/`.

| Surface | Endpoints | Tier 0 |
| --- | --- | --- |
| Home: Timeline, Ask, proof | `GET /events`, `GET /moments`, `POST /ask` | T0-2, T0-5, T0-8 |
| Suggestion card (per mode) | `GET /actions`, `POST /actions/{id}/confirm`, `POST /actions/{id}/undo`, `POST /modes/{id}/activate` | T0-7 |
| Track It chip, Waiting On sheet | `GET /promises`, `POST /promises/{id}/confirm` | T0-4 |
| People sheet | `GET /people`, `GET /people/{id}/brief`, `POST /actions/propose` | T0-3, T0-6 |
| Capture sheet | `POST /moments` (source `phone`), `GET /privacy` | T0-1 (fallback) |
| Moment sheet | `DELETE /moments/{id}` (with an undo toast) | T0-9 |
| Settings and Privacy | `POST /privacy/pause` | T0-9 |
| Receipts sheet | `GET /receipts`, `POST /actions/{id}/undo` | T0-7 |
| Call sheet | `call.started` and `call.ended` events, `call` moments | T0-10 |
