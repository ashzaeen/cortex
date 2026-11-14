# 0004: Sponsor stack (call agent, speech, models)

- **Status:** Proposed (not decided)
- **Decider:** call owner (TODO: handle) with the backend lead
- **Issue:** see the M0 Chert and LiveKit spikes
- **Date:** 2026-11-14

## Context
Chert is required for the Best Use of FaceTime track: it bridges an iPhone FaceTime call into a LiveKit room on our own LiveKit project, and our agent joins that room. The agent must greet within 10 s of the bridge being ready, read caller camera frames, and call the backend API. Speech-to-text, text-to-speech, an LLM with tool calling, and a vision model are also needed. Confirm the other sponsor tracks on the HackUTA 2026 Devpost before choosing providers, in case a sponsor tool earns a prize.

## Options
### A. LiveKit Agents in Python
- Pros: most complete agents SDK and examples; same language as option A of ADR 0001.
- Cons: second language if the backend is TypeScript.

### B. LiveKit Agents in Node or TypeScript
- Pros: same language as a TypeScript backend and the dashboard.
- Cons: fewer examples for video input.

Speech, LLM and vision providers: pick one fast provider each after a latency test; record the picks here.

## Decision
Not decided.

## Consequences
The call agent only talks to the backend through `contracts/openapi.yaml`; it never reads the data store directly. Keys live in `.env` only (see `.env.example`).
