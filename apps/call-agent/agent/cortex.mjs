// Cortex API client for the call agent. Talks to Cortex only through contracts/openapi.yaml:
//   POST /calls/started, POST /calls/ended   (call lifecycle, proposed in the call-lifecycle contract change)
//   POST /ask {question, channel: "call"}    (answer from memory)
//   GET  /people, GET /people/{id}/brief     (spoken brief)
//   POST /moments {source: "call", call_id}  (save what the caller's camera shows)
// No LiveKit imports here, so it runs and is tested without the agent's dependencies installed.
//
// Every method returns a result object and never throws: a missing or slow Cortex API must not end a call.

const CHERT_IDENTITY_PREFIX = 'chert-bridge-';
export const DEFAULT_API_URL = 'http://127.0.0.1:4010'; // the local stateful mock (make dev)
const FRESH_FRAME_MS = 5000; // a saved picture must be this recent (the caller may have muted the camera)

const log = (event, extra = {}) => console.log(JSON.stringify({ cortex: event, ...extra }));

/** The Chert call id from the bridge participant's identity (`chert-bridge-<call id>`). */
export function callIdFromIdentity(identity) {
  const id = String(identity ?? '');
  return id.startsWith(CHERT_IDENTITY_PREFIX) ? id.slice(CHERT_IDENTITY_PREFIX.length) : id;
}

/** True for a URL that only works on the machine it is read on (localhost, 127.x, ::1, 0.0.0.0). */
export function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || host === '0.0.0.0' || host.endsWith('.localhost') || /^127\./.test(host);
  } catch {
    return false;
  }
}

/**
 * A warning for the one setup that fails quietly: an agent on a real LiveKit worker (the hosted setup) whose
 * Cortex API address is the local mock. Every memory lookup would then answer "memory is not reachable".
 * Returns the text to log, or null when the setup is fine. On a laptop in Chert rooms (no LiveKit keys) the
 * local mock is expected, so there is no warning.
 * @param {string | undefined} apiUrl the CORTEX_API_URL value (empty or undefined means the default)
 * @param {boolean} onLiveKitWorker true when the agent runs with its own LiveKit keys
 */
export function localApiWarning(apiUrl, onLiveKitWorker) {
  const url = apiUrl || DEFAULT_API_URL;
  if (!onLiveKitWorker || !isLocalUrl(url)) return null;
  return `CORTEX_API_URL is ${apiUrl ? `"${url}"` : `not set (default ${DEFAULT_API_URL})`}, which is this machine's own address, but the agent runs on a LiveKit worker. ` +
    'Set CORTEX_API_URL to the hosted Cortex API, or every memory lookup, save and call report will fail.';
}

/**
 * @param {{ baseUrl?: string, apiKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createCortexClient({ baseUrl = process.env.CORTEX_API_URL || DEFAULT_API_URL, apiKey = process.env.CORTEX_API_KEY, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  // The backend requires this key on every route but /health when CORTEX_API_KEY is set there. Never logged.
  const keyHeader = apiKey && apiKey.trim() ? { 'x-cortex-key': apiKey.trim() } : {};

  async function request(method, path, body, ms = timeoutMs) {
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json', ...keyHeader },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(ms),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.error?.code ?? `http_${res.status}`;
        log('request_failed', { method, path, status: res.status, code });
        return { ok: false, status: res.status, code, message: data?.error?.message ?? null };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      const code = err?.name === 'TimeoutError' ? 'timeout' : 'unreachable';
      log('request_failed', { method, path, code });
      return { ok: false, status: 0, code, message: String(err?.message ?? err).slice(0, 200) };
    }
  }

  return {
    baseUrl: base,
    callStarted: callId => request('POST', '/calls/started', { call_id: callId }, 4000),
    callEnded: callId => request('POST', '/calls/ended', { call_id: callId }, 3000),
    ask: question => request('POST', '/ask', { question, channel: 'call' }),
    people: () => request('GET', '/people'),
    brief: personId => request('GET', `/people/${encodeURIComponent(personId)}/brief`),
    saveMoment: ({ callId, jpeg, transcript }) =>
      request('POST', '/moments', {
        ts: new Date().toISOString(),
        source: 'call',
        call_id: callId,
        snapshot_base64: jpeg.toString('base64'),
        ...(transcript ? { transcript } : {}),
      }, 30000), // ingest runs a vision model on the picture
  };
}

// What the model hears back when Cortex cannot be reached: honest and short.
const UNAVAILABLE = { error: 'Memory is not reachable right now. Tell the caller you cannot check memory at the moment.' };

/**
 * The three things the model can do. Each returns a small plain object that is sent back to the model.
 * @param {{ client: ReturnType<typeof createCortexClient>, callId: string, getLatestFrame: () => ({ jpeg: Buffer, at: number } | null), now?: () => number }} deps
 */
export function memoryActions({ client, callId, getLatestFrame, now = Date.now }) {
  return {
    /** Answer from memory (POST /ask, channel call). */
    async askMemory({ question }) {
      const q = String(question ?? '').trim();
      if (!q) return { error: 'No question was given.' };
      const res = await client.ask(q);
      if (!res.ok) return UNAVAILABLE;
      const { spoken, answer, grounded, sources = [] } = res.data;
      return {
        answer: spoken || answer,
        grounded: grounded === true,
        sources: sources.length,
        ...(grounded ? {} : { note: 'Nothing saved supports an answer. Say so; do not guess.' }),
      };
    },

    /** Spoken brief about one person (GET /people, then GET /people/{id}/brief). */
    async briefPerson({ name }) {
      const wanted = String(name ?? '').trim().toLowerCase();
      if (!wanted) return { error: 'No name was given.' };
      const list = await client.people();
      if (!list.ok) return UNAVAILABLE;
      const people = list.data.items ?? [];
      const exact = people.filter(p => p.name.toLowerCase() === wanted);
      const loose = people.filter(p => p.name.toLowerCase().includes(wanted) || wanted.includes(p.name.toLowerCase()));
      const matches = exact.length ? exact : loose;
      if (matches.length === 0) return { found: false, note: 'Nobody by that name is in memory.' };
      if (matches.length > 1) return { found: false, ambiguous: matches.map(p => (p.company ? `${p.name} from ${p.company}` : p.name)) };
      const res = await client.brief(matches[0].id);
      if (!res.ok) return UNAVAILABLE;
      return { found: true, brief: res.data.spoken, bullets: res.data.bullets ?? [] };
    },

    /** Save the caller's latest camera picture as a moment (POST /moments, source call). Only on request. */
    async saveWhatYouSee({ note }) {
      const frame = getLatestFrame();
      if (!frame || now() - frame.at > FRESH_FRAME_MS) {
        return { saved: false, reason: 'no_picture', note: 'There is no current picture. Ask the caller to turn their camera on and hold the item still.' };
      }
      const res = await client.saveMoment({ callId, jpeg: frame.jpeg, transcript: String(note ?? '').trim() || undefined });
      if (res.ok) return { saved: true };
      if (res.status === 409) return { saved: false, reason: res.code, note: 'Capture is paused or off the record, so nothing was saved. Tell the caller.' };
      return { saved: false, reason: res.code, note: 'It could not be saved. Tell the caller.' };
    },
  };
}
