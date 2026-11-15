// Caller vision: forwards the caller's FaceTime camera to the Gemini Live session.
//
// Chert's docs (facetime/audio-video): in BYOR the caller's camera arrives as the bridge
// participant's `facetime-remote-video` track, and the agent supplies its own vision model.
// This module reads that track, turns about one frame per second into a small JPEG, and sends
// it into the live Gemini session. The Node Google plugin has no video input of its own
// (its pushVideo is an empty stub), so frames are sent through the session's realtime input.
import { RoomEvent, TrackKind, VideoBufferType, VideoStream } from '@livekit/rtc-node';
import jpeg from 'jpeg-js';

const CALLER_TRACK_NAME = 'facetime-remote-video';
const FRAME_INTERVAL_MS = 1000; // about one still image per second
const MAX_WIDTH = 640; // shrink frames before encoding
const JPEG_QUALITY = 60;

const log = (event, extra = {}) => console.log(JSON.stringify({ vision: event, ...extra }));

// Nearest-neighbour downscale of an RGBA buffer, so frames stay small and cheap to send.
function downscale(rgba, width, height) {
  if (width <= MAX_WIDTH) return { data: rgba, width, height };
  const outW = MAX_WIDTH;
  const outH = Math.max(1, Math.round((height * outW) / width));
  const out = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / outH));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / outW));
      const si = (sy * width + sx) * 4;
      const di = (y * outW + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

/**
 * Start forwarding the caller's camera frames.
 * @param room       the LiveKit room
 * @param callerIdentity  identity of the Chert bridge participant (chert-bridge-<call id>)
 * @param getSession returns the current Gemini RealtimeSession, or undefined if there is none
 * @returns a function that stops forwarding
 */
export function startCallerVision(room, callerIdentity, getSession) {
  let stopped = false;
  let active = null; // { trackSid, cancel }
  const muted = new Set(); // track sids that the caller has muted
  let sent = 0;

  const isCallerVideo = (track, publication, participant) =>
    participant?.identity === callerIdentity &&
    track?.kind === TrackKind.KIND_VIDEO &&
    (publication?.name === CALLER_TRACK_NAME || !active);

  const startPump = async (track, publication) => {
    const sid = publication?.sid ?? track.sid;
    if (active?.trackSid === sid) return;
    active?.cancel();
    let cancelled = false;
    const reader = new VideoStream(track).getReader();
    active = {
      trackSid: sid,
      cancel: () => {
        cancelled = true;
        reader.cancel().catch(() => {});
      },
    };
    log('track_started', { name: publication?.name, source: publication?.source, sid });
    let last = 0;
    try {
      while (!cancelled && !stopped) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        const now = Date.now();
        if (now - last < FRAME_INTERVAL_MS || muted.has(sid)) continue;
        const session = getSession();
        if (!session) continue; // no live model session yet: do not queue stale images
        last = now;
        const rgba = value.frame.convert(VideoBufferType.RGBA);
        const small = downscale(rgba.data, rgba.width, rgba.height);
        const encoded = jpeg.encode({ data: small.data, width: small.width, height: small.height }, JPEG_QUALITY);
        session.sendClientEvent({
          type: 'realtime_input',
          value: { mediaChunks: [{ mimeType: 'image/jpeg', data: Buffer.from(encoded.data).toString('base64') }] },
        });
        sent++;
        if (sent === 1 || sent % 15 === 0) {
          log('frame_sent', { count: sent, width: small.width, height: small.height, bytes: encoded.data.length });
        }
      }
    } catch (err) {
      log('pump_error', { message: String(err?.message ?? err).slice(0, 200) });
    } finally {
      if (active?.trackSid === sid) active = null;
      log('track_stopped', { sid, framesSent: sent });
    }
  };

  const onSubscribed = (track, publication, participant) => {
    if (isCallerVideo(track, publication, participant)) startPump(track, publication);
  };
  const onUnsubscribed = (track, publication, participant) => {
    if (participant?.identity === callerIdentity && active?.trackSid === (publication?.sid ?? track.sid)) active.cancel();
  };
  const onMuted = (publication, participant) => {
    if (participant?.identity === callerIdentity && publication?.kind === TrackKind.KIND_VIDEO) {
      muted.add(publication.sid);
      log('caller_camera_muted');
    }
  };
  const onUnmuted = (publication, participant) => {
    if (participant?.identity === callerIdentity && publication?.kind === TrackKind.KIND_VIDEO) {
      muted.delete(publication.sid);
      log('caller_camera_unmuted');
    }
  };

  room.on(RoomEvent.TrackSubscribed, onSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
  room.on(RoomEvent.TrackMuted, onMuted);
  room.on(RoomEvent.TrackUnmuted, onUnmuted);

  // The track may already be subscribed by the time this starts.
  const caller = room.remoteParticipants.get(callerIdentity);
  for (const publication of caller?.trackPublications.values() ?? []) {
    if (publication.track && publication.kind === TrackKind.KIND_VIDEO) onSubscribed(publication.track, publication, caller);
  }

  return () => {
    stopped = true;
    active?.cancel();
    room.off(RoomEvent.TrackSubscribed, onSubscribed);
    room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    room.off(RoomEvent.TrackMuted, onMuted);
    room.off(RoomEvent.TrackUnmuted, onUnmuted);
  };
}
