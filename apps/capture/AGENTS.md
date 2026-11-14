# apps/capture: agent notes

- **Owns:** the glasses and phone capture clients. Label `area:capture`. Owner: @794KHSameer (hardware and Meta glasses lead, #2, #3, #10). The iOS app (`glasses/`, #36) is @ashzaeen's; camera streaming inside it (#39) is @ahnafzabir-utd's.
- **Stack (ADR 0003, Accepted):** native iOS (Swift) app for the glasses camera (#36), built against Mock Device Kit first; the phone fallback is a screen in the web dashboard.
- **Run alone:** post to the mock (`make mock`, `CORTEX_API_URL=http://127.0.0.1:4010`); the mock validates your payload.
- **Contract:** `POST /moments` with `MomentIngest`; check `GET /privacy` before posting.
- **Done-when test (T0-1):** saying a sentence and showing an object produces a stored moment within a few seconds. Measure the latency and record it in the docs/STATUS.md notes.
- **Rules:** never post while paused or off-the-record; no face recognition; keep sampled snapshots only, never raw video.
