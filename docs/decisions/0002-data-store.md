# 0002: Data store

- **Status:** Proposed (not decided)
- **Decider:** backend lead (TODO: handle)
- **Issue:** see `type:decision` issue "Decide data store (ADR 0002)"
- **Date:** 2026-11-14

## Context
Each moment stores a timestamp, transcript, caption, snapshot reference and an embedding. Search must return the right source moment every time on the seeded data (T0-2), and delete must remove a moment plus its derived data (T0-9). People, promises, actions and receipts are small relational records. Snapshots need object storage or a local folder.

## Options
### A. MongoDB Atlas with Atlas Vector Search
- Pros: documents match the JSON Schemas directly; vector and metadata filters in one query; free tier; may count for a sponsor prize if MongoDB sponsors.
- Cons: needs network access at the venue (cache seeded data locally); vector index setup takes time to learn.

### B. Postgres with pgvector
- Pros: named in the PRD's stack table; relational joins for people and promises; runs locally in Docker, so the demo does not depend on venue wifi.
- Cons: schema migrations; hosting choice still needed.

## Decision
Not decided. The backend lead records it here and marks the ADR Accepted.

## Consequences
Seed loading (`make seed`) and delete semantics are implemented by the backend against whichever store wins.
