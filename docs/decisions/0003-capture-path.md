# 0003: Capture path

- **Status:** Accepted (2026-11-14, @ashzaeen)
- **Decider:** team, recorded by @ashzaeen. Build: iOS app lead @ahnafzabir-utd (#36, #39; [apps/capture/glasses/README.md](../../apps/capture/glasses/README.md)), glasses testing @794KHSameer (#2)
- **Issue:** #2, #3, #4, #36, #39
- **Date:** 2026-11-14

## Context
Apps do not run on the glasses: a phone app receives camera frames and audio. Meta's docs (checked 2026-11-14) say:
- The Wearables Device Access Toolkit ships **only as native iOS (Swift Package) and Android SDKs**. There is no web or JavaScript SDK. Meta's "Web Apps" track runs only on Meta Ray-Ban Display glasses and gives a phone web page no camera access.
- **Ray-Ban Meta Gen 1 and Gen 2 are supported devices**, but "capability availability varies by device", so Gen 1 camera streaming still needs the #2 test.
- Toolkit 1.0.1 needs Meta AI app V292, glasses firmware V128, iOS 17.2+ and Xcode 26.4+.
- Developer mode in the Meta AI app lets an unpublished app use our own glasses with no review.
- Mock Device Kit simulates camera streaming from the phone camera or a video file, so the app can be built before the glasses are in hand.

Sources: [FAQ](https://developers.meta.com/wearables/faq/), [getting started](https://wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit/), [version dependencies](https://wearables.developer.meta.com/docs/develop/dat/version-dependencies/), [Mock Device Kit](https://wearables.developer.meta.com/docs/develop/dat/mock-device-kit/), [iOS SDK](https://github.com/facebook/meta-wearables-dat-ios).

## Options
### A. Native capture app for the glasses camera, built now
- Pros: the PRD's story ("it sees what you see") from day one.
- Cons: needs a Mac with Xcode 26.4+, an iPhone on iOS 17.2+, and developer mode; Gen 1 streaming is still unverified.

### B. Web only; add the native app only if #2 passes
- Pros: the demo never depends on it.
- Cons: the pitch is "what you see and show it" until the spike passes.

### C. Never use the glasses camera
- Pros: simplest.
- Cons: gives up the main hardware story.

## Decision
**A.** Everything the wearer and judges see is a responsive, iPhone-first web app ([ADR 0005](0005-dashboard-stack.md)). Alongside it, a **small native iOS capture app** (Swift, starting from Meta's CameraAccess sample) streams the glasses camera and posts moments to `POST /moments` with `source: "glasses"`. It does nothing else: no screens beyond connect, capture state and pause.

The **phone fallback stays**: the web app's capture screen uses the iPhone camera and mic and posts the same payload with `source: "phone"`. If #2 shows Gen 1 cannot stream, the demo switches to it the same day.

## Consequences
- `apps/capture/glasses/`: native iOS app (Swift). Build against Mock Device Kit first, then the real glasses.
- `apps/capture/phone/`: becomes a route in the web dashboard, not a separate app (agree the folder move with @794KHSameer).
- Glasses audio: the glasses act as a Bluetooth mic and speakers for the web app.
- Needs a human: a Mac with Xcode 26.4+, an iPhone on iOS 17.2+, the glasses on firmware V128, developer mode enabled. See docs/RISKS.md.
