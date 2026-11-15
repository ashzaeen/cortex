# 0001: Backend stack

- **Status:** Accepted (2026-11-14, by Md Abrar Al Zabir)
- **Decider:** backend lead (@ClosetCoderSad)
- **Issue:** #8
- **Date:** 2026-11-14

## Context
`apps/backend` serves the memory API and the agent brain defined in `contracts/openapi.yaml`: ingest, search with source moments, people, promises, brief, actions with undo, receipts, privacy and an SSE event stream. It must be fast to build in about 36 hours, call LLM, speech and vision APIs, and be reachable from capture, the dashboard and the call agent. Whatever is chosen must implement the contract unchanged or change it through the contract-change process.

## Options
### A. Python with FastAPI
- Pros: strongest AI and data libraries; pydantic models map well to the JSON Schemas; LiveKit Agents has a mature Python SDK, so backend and call agent could share code; SSE via `sse-starlette`.
- Cons: a second language if the dashboard is TypeScript; async pitfalls under load.

### B. TypeScript on Node (for example Hono or Express)
- Pros: one language with a Next.js dashboard; types generated from `openapi.yaml` shared with the dashboard; AI SDK and LiveKit Node SDK available.
- Cons: fewer data and ML libraries; schema validation needs extra tooling.

## Decision
**Option A: Python 3.11+ with FastAPI**, sync handlers (FastAPI runs them in threads). Implemented in `apps/backend/`.

## Consequences
Whichever wins adds `apps/backend/Makefile` targets (`setup`, `dev`, `test`, `lint`, `seed`) so the root Makefile picks them up.
