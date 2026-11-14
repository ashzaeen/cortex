# Status: what works right now

Source of truth for what works. Update it in the same PR as the change. States: `not started`, `in progress`, `works`, `broken`. Mark `works` only after you ran the done-when test yourself, and fill in last verified as `YYYY-MM-DD @handle`. `make check` rejects a `works` row with no last-verified entry.

Tier 0 must pass twice in a row before any Tier 1 work starts. Done-when tests: [PLAN.md](PLAN.md). Process: pinned issue [#1 Status board](https://github.com/ashzaeen/cortex/issues/1).

| id | item | state | last verified | issue | notes |
| --- | --- | --- | --- | --- | --- |
| T0-1 | Capture to backend (glasses or phone) | not started | - | [#13](https://github.com/ashzaeen/cortex/issues/13) | |
| T0-2 | Shared memory search returns source moment | not started | - | [#14](https://github.com/ashzaeen/cortex/issues/14) | |
| T0-3 | Network skill: introduction creates contact card | not started | - | [#15](https://github.com/ashzaeen/cortex/issues/15) | |
| T0-4 | Waiting-on tracker with one-tap confirm | not started | - | [#16](https://github.com/ashzaeen/cortex/issues/16) | |
| T0-5 | Ask with proof receipt | not started | - | [#17](https://github.com/ashzaeen/cortex/issues/17) | |
| T0-6 | Pre-meeting brief, spoken | not started | - | [#18](https://github.com/ashzaeen/cortex/issues/18) | |
| T0-7 | Action loop: follow-up email with undo | not started | - | [#19](https://github.com/ashzaeen/cortex/issues/19) | |
| T0-8 | Live dashboard: Live, Timeline, Ask, Proof receipts | not started | - | [#20](https://github.com/ashzaeen/cortex/issues/20) | |
| T0-9 | Privacy: pause or off-the-record, delete a moment | not started | - | [#21](https://github.com/ashzaeen/cortex/issues/21) | |
| T0-10 | Chert inbound call with caller camera, answered from memory | not started | - | [#22](https://github.com/ashzaeen/cortex/issues/22) | |
| T0-11 | Demo reliability: seeded data, frozen script, backup video | not started | - | [#23](https://github.com/ashzaeen/cortex/issues/23) | |

## Tooling (not Tier 0)

| item | state | notes |
| --- | --- | --- |
| Mock API from `contracts/openapi.yaml` (`make dev`) | works | Prism on port 4010; verified locally 2026-11-14 during repo setup |
| Contract and fixture validation (`make check`) | works | Passes locally 2026-11-14; CI runs it on every PR and push to main |
