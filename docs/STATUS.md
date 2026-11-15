# Status: what works right now

Source of truth for what works. Update it in the same push as the change. States: `not started`, `in progress`, `works`, `broken`. Mark `works` only after you ran the done-when test yourself, and fill in last verified as `YYYY-MM-DD @handle`. `make check` rejects a `works` row with no last-verified entry.

Tier 0 must pass twice in a row before any Tier 1 work starts. Done-when tests: [PLAN.md](PLAN.md). Process: pinned issue [#1 Status board](https://github.com/ashzaeen/cortex/issues/1).

| id | item | state | last verified | issue | notes |
| --- | --- | --- | --- | --- | --- |
| T0-1 | Capture to backend (glasses or phone) | in progress | - | [#13](https://github.com/ashzaeen/cortex/issues/13) | `POST /moments` accepts photos and videos capped at 10 seconds; offline image/video ingest tests pass. An 8.9 s MP4 was analyzed by real Gemini, stored in Atlas/Tiger, fetched byte-for-byte and deleted successfully (2026-11-14 @794KHSameer). CameraAccess auto-connects/streams after permission, automatically uploads captured photos, auto-stops videos at 10 seconds and uploads them (#36, #39, #46). Simulator build passes; physical-glasses verification is still required before `works` |
| T0-2 | Shared memory search returns source moment | in progress | - | [#14](https://github.com/ashzaeen/cortex/issues/14) | `memory/search.py`; done-when test passes offline (mongomock + mock LLM, 2026-11-14). Not yet run on Atlas Vector Search with Gemini embeddings |
| T0-3 | Network skill: introduction creates contact card | in progress | - | [#15](https://github.com/ashzaeen/cortex/issues/15) | `skills/network.py`; done-when test passes offline. Re-introducing seeded Ash is open in #43 |
| T0-4 | Waiting-on tracker with one-tap confirm | in progress | - | [#16](https://github.com/ashzaeen/cortex/issues/16) | `skills/promises.py`; done-when test passes offline. Not yet run with Gemini |
| T0-5 | Ask with proof receipt | in progress | - | [#17](https://github.com/ashzaeen/cortex/issues/17) | `skills/ask.py`; done-when test passes offline. Not yet run with Gemini or by voice from capture |
| T0-6 | Pre-meeting brief, spoken | in progress | - | [#18](https://github.com/ashzaeen/cortex/issues/18) | `skills/brief.py`; done-when test passes offline (template fallback). Not yet run with Gemini or spoken on the glasses |
| T0-7 | Action loop: follow-up email with undo | in progress | - | [#19](https://github.com/ashzaeen/cortex/issues/19) | `actions/followup.py`; done-when tests pass offline (dry-run draft, 30 s undo window). Real SMTP or Resend send not yet tried |
| T0-8 | Live dashboard: Live, Timeline, Ask, Proof receipts | in progress | - | [#20](https://github.com/ashzaeen/cortex/issues/20) | Brass dashboard works on the stateful mock (see Tooling). Not yet run against the real backend or on an iPhone |
| T0-9 | Privacy: pause or off-the-record, delete a moment | in progress | - | [#21](https://github.com/ashzaeen/cortex/issues/21) | `memory/delete.py` cascade plus `POST /privacy/pause`; done-when test passes offline. Not yet run on Atlas and Tiger Data |
| T0-10 | Chert inbound call with caller camera, answered from memory | in progress | - | [#22](https://github.com/ashzaeen/cortex/issues/22) | Per @ahnafzabir-utd's handoff (docs/CHERT_CALL_LAYER_HANDOFF.md): inbound call, greeting on bridge_ready and caller camera to Gemini work on real calls. Not yet answering from Cortex memory or saving moments. |
| T0-11 | Demo reliability: seeded data, frozen script, backup video | not started | - | [#23](https://github.com/ashzaeen/cortex/issues/23) | |

## Tooling (not Tier 0)

| item | state | notes |
| --- | --- | --- |
| Mock API from `contracts/openapi.yaml` (`make dev`) | works | Prism on port 4010; verified locally 2026-11-14 during repo setup |
| Stateful mock with Ash demo driver (`apps/dashboard/mock`, #37) | works | 66-check contract test passes locally 2026-11-14; runs in `make check` |
| Brass dashboard on the mock (`make dev`) | works | Home, mode dock and all sheets over the `/api` proxy with SSE. Measured in Edge 2026-11-14: fits one screen at 1280x720 to 1440x900, no tile overflows at those sizes or 390x844. Not yet T0-8: no real-backend or iPhone test |
| Public demo at `/demo` (#44) | works | Demo profile (owner Ashzaeen Fatmi Khan, a week across all modes, 8 people, real photos plus drawn slides) runs in the visitor's browser, with no backend. `profile-test.mjs` passes 303 checks; walked through in Edge at 1440x900 and 390x844 with the production build and no API, with no console errors (2026-11-14 @ashzaeen) |
| Dashboard on Vercel (#38) | works | https://cortex-dashboard-seven.vercel.app deploys on push to `main`; page returns 200 and opens in iPhone Safari (2026-11-14 @ashzaeen). `CORTEX_API_URL` (Production and Preview) points `/api/*` at the hosted backend; `/api/health`, `/api/ask` and live `/api/events` verified through the proxy 2026-11-14 @ashzaeen. iPhone check of #42 still to do |
| Hosted backend on Railway (#42) | works | https://api-production-47227cba.up.railway.app, Docker (`apps/backend/Dockerfile`, one process: SSE and undo timers live in memory) on real Atlas, Tiger Data and Gemini. `/health` 200, grounded `/ask` with a source moment, Tiger writes with no errors (2026-11-14 @ashzaeen). Redeploy from the repo root with `railway up --ci --service api`; pushing to `main` does not redeploy. Keys live in Railway variables only |
| Backend offline (`make -C apps/backend test`) | works | FastAPI app for every contract operation; 19 tests (contract plus done-when for T0-1 to T0-7 and T0-9) pass with mongomock and the mock LLM, 2026-11-14 @ashzaeen. Backend for #41's new action types is open in #45 |
| Contract and fixture validation (`make check`) | works | Passes locally 2026-11-14; CI runs it on every push to main |
