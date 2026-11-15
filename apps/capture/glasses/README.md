# Cortex iOS app (glasses capture)

**Lead: @ahnafzabir-utd.** Owns everything in this folder: the app, the Meta toolkit setup, camera streaming, and posting moments. Issues: [#36](https://github.com/ashzaeen/cortex/issues/36) (app, connection, moment posting) and [#39](https://github.com/ashzaeen/cortex/issues/39) (camera streaming). Decision: [ADR 0003](../../../docs/decisions/0003-capture-path.md).

## What it is, and what it is not

A small native iOS app (Swift) whose only job is to get what the Ray-Ban Meta glasses **see** into Cortex. Meta's Wearables Device Access Toolkit is the only way to read the glasses camera, and it is native iOS or Android only, so this cannot be part of the web app.

- **It does:** connect to the glasses, show connection and capture state, pause, capture a frame on a cue, and post it as a moment to `POST /moments` with `source: "glasses"`.
- **It does not:** show memory, answers, receipts or anything else. The iPhone-first web dashboard does that ([ADR 0005](../../../docs/decisions/0005-dashboard-stack.md)). Glasses audio (mic and speakers) goes to the web app over normal Bluetooth.
- **If it fails:** the web app's phone capture screen posts the same payload with `source: "phone"` (#4), and the demo goes on.

## What you need

| Item | Version | Status |
| --- | --- | --- |
| Mac with Xcode | 26.4 or newer | TODO: confirm who has one |
| iPhone | iOS 17.2 or newer | TODO: confirm whose (needed for the glasses and demo day) |
| Meta AI app | V292 or newer (toolkit 1.0.1) | |
| Glasses firmware | V128 or newer | Check with @794KHSameer |
| Ray-Ban Meta Gen 1 glasses | | @794KHSameer, #10 |

Toolkit versions and requirements come from Meta's [version dependencies](https://wearables.developer.meta.com/docs/develop/dat/version-dependencies/) page, checked 2026-11-14. Check it again before you start.

## Setup outline

1. Read Meta's [getting started](https://wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit/) guide and the [iOS SDK repo](https://github.com/facebook/meta-wearables-dat-ios). Start from Meta's CameraAccess sample app.
2. Add the toolkit as a Swift Package.
3. **Develop against Mock Device Kit first.** It simulates the glasses, including camera streaming from the phone camera or a video file ([docs](https://wearables.developer.meta.com/docs/develop/dat/mock-device-kit/)), so you are not blocked on hardware.
4. To use the real glasses: in the Meta AI app, open Settings > App Info, tap the app version five times, and turn on Developer Mode. The app then appears under App connections > Developer mode apps. No review or publishing is needed for our own glasses.
5. Gen 1 is a supported device, but Meta says capability availability varies by device. #2 (@794KHSameer) confirms that Gen 1 actually streams.

## Build the checked-in app

1. Open `CameraAccess.xcodeproj` in Xcode 26.4 or newer. Xcode resolves Meta Wearables DAT 1.0.1 from its public Swift package automatically.
2. Select the `CameraAccess` target, choose your Apple development team under Signing & Capabilities, and use a unique bundle identifier if Xcode requests one.
3. Add `CLIENT_TOKEN` and `META_APP_ID` as user-defined build settings for the Meta developer app used by the team.
4. Set the user-defined `CORTEX_API_URL` build setting to the Cortex API base URL reachable from the iPhone, for example `http://<laptop-ip>:8000`. Do not commit a personal IP address or API key.
5. Run on an iPhone for real glasses, or open the debug menu to exercise camera streaming with Mock Device Kit and the included test media.

The app connects, streams, captures frames, records media, checks `GET /privacy`, and submits a sampled JPEG to `POST /moments` as `source: "glasses"`. The backend sends the frame to Gemini, stores the resulting caption and moment in MongoDB, indexes its timeline and metrics in Tiger Data, and publishes `moment.created`; the dashboard consumes that event and refreshes automatically. The app never sends while privacy is paused or off the record. A dedicated pause/off-the-record control and real-glasses latency/frame-rate verification remain work for #36 and #39.

## Contract

Talk to Cortex only through [contracts/openapi.yaml](../../../contracts/openapi.yaml):

- `GET /privacy`: never post while the state is `paused` or `off_record`.
- `POST /moments` with a `MomentIngest` body: `ts` (device time), `source: "glasses"`, `snapshot_base64` (JPEG), and `transcript` or `audio_base64` if you have it.

Run `make mock` on the laptop and point the app at it while the backend doesn't exist. The mock rejects a wrong payload with a 422. Keep the API base URL in a setting, never hard-coded, and never put keys in the app or the repo.

## Done when

- **#36:** the app builds and runs on an iPhone, registers in developer mode, shows connection and capture state with pause, and posts a test moment that returns 201.
- **#39:** a cue captures a glasses frame and posts it as a moment. Only sampled snapshots are sent, never raw video. Note the latency and frame rate on the issue and in docs/STATUS.md (T0-1).

## Open questions (answer on #36)

- Who has the Mac, and whose iPhone runs the app on demo day?
- Does an Xcode free personal team suffice for installing on the demo iPhone, or does the team need a paid Apple developer account?
- What actually triggers a capture on stage: a tap in the app, or a spoken cue?

Follow the rules in the root [AGENTS.md](../../../AGENTS.md): claim the issue, push to `main` after `git pull` and `make check`, and leave a handoff comment.
