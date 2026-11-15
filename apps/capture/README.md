# apps/capture

Turns what the wearer hears and sees into moments and posts them to `POST /moments` ([contract](../../contracts/openapi.yaml)). Both paths post moments today; neither has run on a real iPhone or the Gen 1 glasses yet (#2, #10, D-1 in [STATUS.md](../../docs/STATUS.md)). The capture path is **Accepted** in [ADR 0003](../../docs/decisions/0003-capture-path.md): a native iOS app for the glasses camera (#36 and #39, led by @ahnafzabir-utd; see [glasses/README.md](glasses/README.md)), with the web app's phone capture as the fallback.

## Two paths, one endpoint

- `glasses/`: a small **native iOS app** (Swift, from Meta's CameraAccess sample) using the Wearables Device Access Toolkit. It streams the glasses camera and, on a tap, checks `GET /privacy` and posts the current frame as a moment with `source: "glasses"` (`CameraAccess/CortexAPI.swift`, 3338de0). Built for the iOS Simulator so far. Needs a Mac with Xcode 26.4+, an iPhone on iOS 17.2+, Meta AI app V292+, glasses firmware V128 and developer mode. Build against Mock Device Kit first. Gen 1 is a supported device, but camera streaming on it is confirmed only by #2.
- **Phone fallback:** built as the **Capture** sheet of the web dashboard, opened from the camera button in the status pill ([apps/dashboard/components/brass/CaptureSheet.tsx](../dashboard/components/brass/CaptureSheet.tsx), #4). It takes a camera snapshot (live camera on HTTPS, or the native photo picker on plain http) plus what was said (typed or dictated with the iPhone keyboard), and posts the same `MomentIngest` payload to the same endpoint with `source: "phone"`. Nothing downstream changes, so the glasses can stay in the story while the phone does the capture.

On both paths, capture is cue-based by default, shows a visible capture state, checks `GET /privacy` and never posts while paused or off-the-record, and sends the device timestamp.

## Run it alone

Point it at the mock: set `CORTEX_API_URL=http://127.0.0.1:4010` with `make mock` running. Prism validates the request body, so a wrong payload gets a 422.
