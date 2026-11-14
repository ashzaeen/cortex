# 0003: Capture path

- **Status:** Proposed (not decided; depends on the Gen 1 spike)
- **Decider:** capture owner (TODO: handle), with the team at the M0 go/no-go
- **Issue:** see the M0 spikes on Gen 1 glasses, latency and the phone fallback
- **Date:** 2026-11-14

## Context
Apps do not run on the glasses; a phone app receives camera frames and audio. It is not yet verified that Meta's Wearables Device Access Toolkit supports Gen 1 glasses and delivers frames at a usable rate. Either way, capture posts moments to one endpoint, `POST /moments`, so the rest of the system does not change.

## Options
### A. Glasses through the Meta toolkit (native iOS Swift or Android Kotlin app)
- Pros: the real product story; hands-free.
- Cons: Gen 1 support and frame rate unverified; native build, developer mode and app registration take time.

### B. Phone fallback: phone camera and mic posting to `POST /moments`
- Pros: works today; could be a small mobile web page or native app; the glasses can stay in the story for audio.
- Cons: less impressive; the wearer holds a phone.

## Decision
Not decided. Decide at the M0 go/no-go; switch to B the same day if A fails. Building B early is a safe fallback either way.

## Consequences
Both paths send the same `MomentIngest` payload, so backend and dashboard are unaffected.
