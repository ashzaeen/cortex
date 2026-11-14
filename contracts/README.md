# contracts

**Status: Proposed.** The single source of truth between capture, backend, dashboard and call agent.

- `openapi.yaml`: every endpoint, including the live event stream (`GET /events`, Server-Sent Events). Its examples are what the mock returns.
- `schemas/*.schema.json`: JSON Schema (2020-12) for Moment, Person, Promise, Action, Receipt and Mode. `openapi.yaml` references them, and `fixtures/` is validated against them.

| Endpoint | Purpose | Tier 0 |
| --- | --- | --- |
| `POST /moments` | Ingest from glasses, phone, call or dashboard | T0-1 |
| `GET /moments`, `GET /moments/search?q=` | Timeline and search, always with source moments | T0-2, T0-8 |
| `POST /people`, `GET /people`, `GET /people/{id}/brief` | Contact cards and the spoken brief | T0-3, T0-6 |
| `POST /promises`, `POST /promises/{id}/confirm`, `GET /promises` | Waiting on and I owe | T0-4 |
| `POST /ask` | Answer plus sources plus receipt id | T0-5, T0-10 |
| `GET /actions`, `POST /actions/propose`, `/actions/{id}/confirm`, `/actions/{id}/undo`, `GET /receipts` | Follow-up email loop | T0-7 |
| `GET /privacy`, `POST /privacy/pause`, `DELETE /moments/{id}` | Pause, off-the-record, delete | T0-9 |
| `GET /events` | Live updates for the dashboard | T0-8 |
| `GET /modes`, `GET /health` | Mode presets, liveness | - |

## Use it

```sh
make mock            # Prism mock at http://localhost:4010
make lint            # Redocly lint of openapi.yaml
make test            # schemas compile, fixtures validate, ids resolve
curl localhost:4010/people
```

## Change it

Follow "Contract changes" in the root [AGENTS.md](../AGENTS.md): use an issue labeled `contract-change` that lists the affected areas and mentions their owners, and update the fixtures and examples in the same push. Prefer additive changes.
