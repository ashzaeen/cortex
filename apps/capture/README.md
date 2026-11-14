# apps/capture

Turns what the wearer hears and sees into moments and posts them to `POST /moments` ([contract](../../contracts/openapi.yaml)). Stub only. The capture path is decided in [ADR 0003](../../docs/decisions/0003-capture-path.md) at the M0 go/no-go.

## Two paths, one endpoint

- `glasses/`: Ray-Ban Meta Gen 1 through Meta's Wearables Device Access Toolkit. Apps do not run on the glasses: a phone app (native iOS or Android) receives camera frames and audio over Bluetooth and posts moments. Gen 1 support and frame rate are **unverified** (M0 spike).
- `phone/`: **the fallback.** A phone capture client (a small mobile web page or a native app) records a short audio clip or transcript plus a camera snapshot, and posts the same `MomentIngest` payload to the same endpoint with `source: "phone"`. Nothing downstream changes, so the glasses can stay in the story while the phone does the capture.

On both paths, capture is cue-based by default, shows a visible capture state, checks `GET /privacy` and never posts while paused or off-the-record, and sends the device timestamp.

## Run it alone

Point it at the mock: set `CORTEX_API_URL=http://127.0.0.1:4010` with `make mock` running. Prism validates the request body, so a wrong payload gets a 422.
