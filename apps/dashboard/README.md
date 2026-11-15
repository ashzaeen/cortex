# apps/dashboard

Companion web app in the **Brass** design system ([design.md](../../design.md)). One Home screen - status pill, Timeline, the suggestion for the current mode, Ask Your Memory - with the mode dock and everything else as sheets. Designed for iPhone Safari first; on laptops the same app fits one screen and is the judges' view.

**Stack ([ADR 0005](../../docs/decisions/0005-dashboard-stack.md), Accepted):** Next.js 16 with TypeScript, Tailwind CSS 4 reading the Brass tokens in `app/globals.css`, Motion for springs and gestures, Lucide icons, three.js (lazy, pairing only), fonts self-hosted with `next/font`, a same-origin `/api` proxy to `CORTEX_API_URL`, a stateful mock in `mock/`, Vercel hosting (#38). Every component and state renders at `/styleguide`.

## Routes

| Path | What |
| --- | --- |
| `/` | Landing page: 3D glasses, a live reel of the Ash flow, modes, privacy. Continue with Google, or Try the Demo |
| `/app` | The app. Requires Google sign-in when `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set (see `auth.ts` and `.env.example`); open otherwise. Sign-in also grants Calendar events, Tasks and Drive (`drive.file`); the `/api` proxy forwards the user's Google access token to the backend on action confirm and undo only (`lib/google-token.ts`), and it never reaches the browser |
| `/demo` | The app on the sample week, in the browser, no account |
| `/styleguide` | Every component in every state |

## Run it

```sh
make dev          # from the repo root: stateful mock on :4010 + dashboard on :3000
```

Open http://localhost:3000. On a phone on the same wifi, open `http://<laptop IP>:3000`. The camera and mic need HTTPS on iPhone, so use the Vercel URL for those.

## Deployed

**https://cortex-dashboard-seven.vercel.app** (Vercel project `cortex-dashboard`, root `apps/dashboard`). Every push to `main` deploys to production. `CORTEX_API_URL` is set in the Vercel project env (Production and Preview), never in the repo, and points `/api/*` at the hosted backend on Railway (#42).

## Public demo (`/demo`)

**https://cortex-dashboard-seven.vercel.app/demo** opens the full app on a demo profile with no backend and no sign-in (#44). It's the target for the landing page's future **Demo** button.

- **Runs in the visitor's tab.** `lib/demo.ts` starts the mock engine (`mock/engine.mjs`) in the browser; `lib/api.ts` and `lib/useCortex.ts` use it instead of `/api` whenever the path starts with `/demo`. Each visitor gets a private copy. Reload or **Reset** restores it.
- **The profile** is in `demo/`: the owner is Ashzaeen Fatmi Khan (their own name, at their request); everyone else is fake. It covers one week (31 moments across Focus, Student, Life and Assist), 8 people, promises in every state, sent and pending actions with receipts, and one suggestion per mode. Ash was met at the career fair earlier in the week, so the Ash script plays as a re-meeting (`person.updated`, proposed in #43).
- **Dates follow the visitor.** The week is written ending on `2026-11-15` (`ANCHOR` in `mock/profile.mjs`), and the engine shifts it so that day is always today.
- **Pictures** are in `public/demo-snaps/`. Photos are Wikimedia Commons images under free licenses, credited in `CREDITS.md`; everyone in them appears under a fake name. Slides, whiteboards, signs, the receipt and the business card are drawn SVGs, so they show exactly what the moments quote.
- **Tested:** `mock/profile-test.mjs` checks schemas, ids, snapshot files and credits, the date shift, recall for 10 questions, and the Ash re-meeting (in `make check`).
- `npm run mock:demo` serves the same profile over HTTP at :4010 for `npm run dev`.

When you edit the profile, keep every recall question in `profile-test.mjs` passing, and credit any new photo.

Other commands, from this folder:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dashboard only (expects an API at `CORTEX_API_URL`, default `http://127.0.0.1:4010`) |
| `npm run mock` | Stateful mock only |
| `npm test` | Runs the Ash script against the mock and checks every response against `contracts/schemas/` |
| `npm run typecheck` | TypeScript check (`make lint` runs it) |
| `npm run tokens` | Regenerates `tokens.json` (Brass tokens for the native iOS app, design.md 20) from `app/globals.css`; `npm test` fails if it is stale |
| `npm run types` | Regenerates `lib/api-types.ts` from `contracts/openapi.yaml`; run it after a contract change |
| `npm run build` | Production build |

`MOCK=prism make dev` uses the plain Prism mock instead (canned answers, no live events).

## Rehearse the Ash script

The **Demo driver** is hidden so judges never see it. Open http://localhost:3000/?demo=1, or turn it on in Settings and Privacy (tap the status pill). It works only with the mock:

- **Ask by voice:** in the Ask sheet, *Tap to Talk* listens (Web Speech API, `lib/voice.ts`), fills the box as words are heard, asks when you stop, and the answer is read aloud with the proof moment opened. Where the browser has no speech recognition the sheet keeps its text box. Needs a tap first on iPhone Safari (the tap also unlocks speech); the glasses' mic and speakers work when they are the phone's Bluetooth audio device.
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
| `mock/engine.mjs` | Stateful mock logic (#37, #44): fake skills, demo driver, date shift; runs in Node and the browser |
| `mock/server.mjs` | HTTP and SSE around the engine; `--profile demo` serves the demo profile |
| `mock/profile.mjs` | Engine options for the demo profile (anchor day, script snapshots) |
| `mock/test.mjs`, `mock/profile-test.mjs` | Contract test for the mock on fixtures; profile test for the demo |
| `app/demo/page.tsx`, `lib/demo.ts`, `demo/`, `public/demo-snaps/` | Public demo: route, in-browser engine, profile data, pictures |

## The mock is not the backend

`mock/engine.mjs` fakes the skills with simple text rules ("This is X from Y", "I'll send you X Friday", keyword search). It exists so the dashboard can be built, rehearsed and demoed without a backend. It must never grow into the real backend, which follows ADR 0001. Mock-only extras that the real backend will not have: `/_demo/*`, the `demo.step` and `person.updated` events (the second is proposed in #43), and static files under `/fixtures/`.

| Surface | Endpoints | Demo checklist |
| --- | --- | --- |
| Home: Timeline, Ask, proof | `GET /events`, `GET /moments`, `POST /ask` | D-2, D-5, D-8 |
| Suggestion card (per mode) | `GET /actions`, `POST /actions/{id}/confirm`, `POST /actions/{id}/undo`, `POST /modes/{id}/activate` | D-7 |
| Track It chip, Waiting On sheet | `GET /promises`, `POST /promises/{id}/confirm` | D-4 |
| People sheet | `GET /people`, `GET /people/{id}/brief`, `POST /actions/propose` | D-3, D-6 |
| Capture sheet | `POST /moments` (source `phone`), `GET /privacy` | D-1 (fallback) |
| Moment sheet | `DELETE /moments/{id}` (with an undo toast) | D-9 |
| Settings and Privacy | `POST /privacy/pause` | D-9 |
| Receipts sheet | `GET /receipts`, `POST /actions/{id}/undo` | D-7 |
| Call sheet | `GET /calls/current` (and the `call.started` / `call.ended` events), `call` moments | D-10 |
