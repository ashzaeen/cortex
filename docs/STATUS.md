# Status: what works right now

Source of truth for what works. Update it in the same PR as the change. States: `not started`, `in progress`, `works`, `broken`. Mark `works` only after you ran the done-when test yourself, and fill in last verified as `YYYY-MM-DD @handle`. `make check` rejects a `works` row with no last-verified entry.

Tier 0 must pass twice in a row before any Tier 1 work starts. Done-when tests: [PLAN.md](PLAN.md).

| id | item | state | last verified | issue | notes |
| --- | --- | --- | --- | --- | --- |
| T0-1 | Capture to backend (glasses or phone) | not started | - | TBD | |
| T0-2 | Shared memory search returns source moment | not started | - | TBD | |
| T0-3 | Network skill: introduction creates contact card | not started | - | TBD | |
| T0-4 | Waiting-on tracker with one-tap confirm | not started | - | TBD | |
| T0-5 | Ask with proof receipt | not started | - | TBD | |
| T0-6 | Pre-meeting brief, spoken | not started | - | TBD | |
| T0-7 | Action loop: follow-up email with undo | not started | - | TBD | |
| T0-8 | Live dashboard: Live, Timeline, Ask, Proof receipts | not started | - | TBD | |
| T0-9 | Privacy: pause or off-the-record, delete a moment | not started | - | TBD | |
| T0-10 | Chert inbound call with caller camera, answered from memory | not started | - | TBD | |
| T0-11 | Demo reliability: seeded data, frozen script, backup video | not started | - | TBD | |

## Tooling (not Tier 0)

| item | state | notes |
| --- | --- | --- |
| Mock API from `contracts/openapi.yaml` (`make dev`) | works | Prism on port 4010 |
| Contract and fixture validation (`make check`) | works | Runs in CI |
