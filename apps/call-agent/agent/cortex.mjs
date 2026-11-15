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

// A redeploy or a gateway blip answers 502/503/504 or refuses the connection while the backend restarts: the request
// most likely never ran, so asking again a moment later is safe for requests that are safe to repeat.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {{ baseUrl?: string, apiKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number, retryDelaysMs?: number[] }} [options]
 */
export function createCortexClient({ baseUrl = process.env.CORTEX_API_URL || DEFAULT_API_URL, apiKey = process.env.CORTEX_API_KEY, user = process.env.CORTEX_USER, fetchImpl = fetch, timeoutMs = 12000, retryDelaysMs = [1000, 2000] } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  // The backend requires this key on every route but /health when CORTEX_API_KEY is set there. Never logged.
  const keyHeader = apiKey && apiKey.trim() ? { 'x-cortex-key': apiKey.trim() } : {};
  // Whose memory the call reads and writes. The dashboard sends the signed-in email as X-Cortex-User, and each user has a
  // private memory; with no header the agent would only see the shared default one (people made in the dashboard are
  // invisible to it). Set CORTEX_USER to the email you sign in to the dashboard with. Never logged.
  const userHeader = user && user.trim() ? { 'x-cortex-user': user.trim() } : {};

  async function once(method, path, body, ms) {
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json', ...keyHeader, ...userHeader },
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

  /**
   * One request. With `retry`, a 502/503/504 or a refused connection is tried again after each delay in retryDelaysMs.
   * Never a timeout (the request may have run) and never a 4xx (asking again cannot change the answer).
   */
  async function request(method, path, body, ms = timeoutMs, { retry = false } = {}) {
    let result = await once(method, path, body, ms);
    for (const delay of retry ? retryDelaysMs : []) {
      if (result.ok || !(RETRYABLE_STATUS.has(result.status) || result.code === 'unreachable')) break;
      log('retrying', { method, path, afterMs: delay });
      await sleep(delay);
      result = await once(method, path, body, ms);
    }
    return result;
  }

  return {
    baseUrl: base,
    asUser: Object.keys(userHeader).length > 0, // true when CORTEX_USER is set (never the value)
    callStarted: callId => request('POST', '/calls/started', { call_id: callId }, 4000),
    callEnded: callId => request('POST', '/calls/ended', { call_id: callId }, 3000),
    ask: question => request('POST', '/ask', { question, channel: 'call' }, timeoutMs, { retry: true }),
    people: () => request('GET', '/people', undefined, timeoutMs, { retry: true }),
    brief: personId => request('GET', `/people/${encodeURIComponent(personId)}/brief`, undefined, timeoutMs, { retry: true }),
    // The follow-up email (backend sends it through Resend after the 30 s undo window). Propose is safe to repeat (the
    // backend returns the open draft) and writes with a model, so it gets longer; confirm and undo are never retried.
    proposeFollowUp: personId => request('POST', '/actions/propose', { type: 'follow_up_email', person_id: personId }, 25000, { retry: true }),
    confirmAction: actionId => request('POST', `/actions/${encodeURIComponent(actionId)}/confirm`, { deliver: 'send' }),
    undoAction: actionId => request('POST', `/actions/${encodeURIComponent(actionId)}/undo`),
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

// Find one person in memory by name. Returns { person } or { out } (the result to hand back to the model).
async function findPerson(client, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return { out: { error: 'No name was given.' } };
  const list = await client.people();
  if (!list.ok) return { out: UNAVAILABLE };
  const people = list.data.items ?? [];
  const exact = people.filter(p => p.name.toLowerCase() === wanted);
  const loose = people.filter(p => p.name.toLowerCase().includes(wanted) || wanted.includes(p.name.toLowerCase()));
  const matches = exact.length ? exact : loose;
  if (matches.length === 0) return { out: { found: false, note: 'Nobody by that name is in memory.' } };
  if (matches.length > 1) return { out: { found: false, ambiguous: matches.map(p => (p.company ? `${p.name} from ${p.company}` : p.name)) } };
  return { person: matches[0] };
}

/**
 * The things the model can do. Each returns a small plain object that is sent back to the model.
 * @param {{ client: ReturnType<typeof createCortexClient>, callId: string, getLatestFrame: () => ({ jpeg: Buffer, at: number } | null), now?: () => number }} deps
 */
export function memoryActions({ client, callId, getLatestFrame, now = Date.now }) {
  // One log line per tool call: its name, whether it worked and how long it took. Never the question, the name
  // asked about or the note: those are the caller's memory.
  const traced = (name, fn, summarize) => async args => {
    const started = performance.now();
    let out;
    try {
      out = await fn(args);
    } catch (err) {
      log('tool', { name, ok: false, ms: Math.round(performance.now() - started), error: 'exception' });
      throw err;
    }
    log('tool', { name, ...summarize(out), ms: Math.round(performance.now() - started) });
    return out;
  };

  let pending = null; // the draft awaiting the caller's yes: { id, name }; only ever made on this call
  let lastSent = null; // the email sent on this call, for "undo that": { id }

  const actions = {
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
      const found = await findPerson(client, name);
      if (found.out) return found.out;
      const res = await client.brief(found.person.id);
      if (!res.ok) return UNAVAILABLE;
      return { found: true, brief: res.data.spoken, bullets: res.data.bullets ?? [] };
    },

    /** Draft a follow-up email to someone in memory (POST /actions/propose). Nothing is sent until sendFollowUp. */
    async draftFollowUp({ name }) {
      const found = await findPerson(client, name);
      if (found.out) return found.out;
      const res = await client.proposeFollowUp(found.person.id);
      if (!res.ok) {
        return res.status === 0 || res.status >= 500 ? UNAVAILABLE : { drafted: false, reason: res.code, note: 'The draft could not be made. Tell the caller.' };
      }
      const draft = res.data.draft ?? {};
      pending = null;
      if (!draft.to) return { drafted: false, reason: 'no_address', note: 'There is no email address for that person, so nothing can be sent. Tell the caller.' };
      pending = { id: res.data.id, name: found.person.name };
      const gist = String(draft.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
      return {
        drafted: true, person: found.person.name, subject: draft.subject ?? '', gist,
        note: 'Read the subject and one short sentence of it aloud, then ask "Shall I send it?". Do not call send_followup until the caller clearly says yes.',
      };
    },

    /** Send the open draft (POST /actions/{id}/confirm). Only with the caller's explicit yes, and only a draft made on this call. */
    async sendFollowUp({ caller_said_yes: callerSaidYes }) {
      if (!pending) return { sent: false, reason: 'no_draft', note: 'There is no draft to send. Draft one first.' };
      if (callerSaidYes !== true) {
        return { sent: false, reason: 'needs_yes', note: 'Ask the caller whether to send it. Call this again only after they clearly say yes.' };
      }
      const { id, name } = pending;
      const res = await client.confirmAction(id);
      if (!res.ok) {
        if (res.status === 409) pending = null; // already sent, undone or dismissed elsewhere
        return { sent: false, reason: res.code, note: res.status === 409 ? 'That draft was already handled.' : 'It could not be sent. Tell the caller.' };
      }
      pending = null;
      if (res.data?.action?.status !== 'sent') {
        return { sent: false, saved_as_draft: true, note: 'Email sending is switched off, so it was only saved as a draft. Tell the caller it was NOT sent.' };
      }
      lastSent = { id };
      const until = Date.parse(res.data?.receipt?.undo?.until ?? '');
      const seconds = Number.isFinite(until) ? Math.max(0, Math.round((until - now()) / 1000)) : 30;
      return { sent: true, person: name, undo_seconds: seconds, note: `It goes out in about ${seconds} seconds. Tell the caller they can say "undo that" until then.` };
    },

    /** Cancel the email sent on this call while its undo window is open (POST /actions/{id}/undo). */
    async undoFollowUp() {
      if (!lastSent) return { undone: false, reason: 'nothing_to_undo', note: 'Nothing was sent on this call.' };
      const res = await client.undoAction(lastSent.id);
      if (res.ok) { lastSent = null; return { undone: true, note: 'It will not be sent.' }; }
      if (res.status === 409) { lastSent = null; return { undone: false, reason: res.code, note: 'It is too late to undo: the window has closed.' }; }
      return { undone: false, reason: res.code, note: 'The undo did not go through. Tell the caller the email may still go out.' };
    },

    /** Save the caller's latest camera picture as a moment (POST /moments, source call). Only on request. */
    async saveWhatYouSee({ note }) {
      const frame = getLatestFrame();
      if (!frame || now() - frame.at > FRESH_FRAME_MS) {
        return { saved: false, reason: 'no_picture', note: 'There is no current picture. Ask the caller to turn their camera on and hold the item still.' };
      }
      // The note is the model's description of the picture, not words anyone said. Label it so search, drafts and the
      // dashboard (which quotes a moment's transcript) do not take it for speech.
      const shown = String(note ?? '').trim();
      const res = await client.saveMoment({ callId, jpeg: frame.jpeg, transcript: shown ? `Shown on the call: ${shown}` : undefined });
      if (res.ok) return { saved: true };
      if (res.status === 409) return { saved: false, reason: res.code, note: 'Capture is paused or off the record, so nothing was saved. Tell the caller.' };
      return { saved: false, reason: res.code, note: 'It could not be saved. Tell the caller.' };
    },
  };

  return {
    askMemory: traced('ask_memory', actions.askMemory, out => ({ ok: !out.error, grounded: out.grounded, sources: out.sources })),
    briefPerson: traced('brief_person', actions.briefPerson, out => ({ ok: !out.error, found: out.found })),
    draftFollowUp: traced('draft_followup', actions.draftFollowUp, out => ({ ok: out.drafted === true, ...(out.reason ? { reason: out.reason } : {}) })),
    sendFollowUp: traced('send_followup', actions.sendFollowUp, out => ({ ok: out.sent === true, ...(out.reason ? { reason: out.reason } : {}) })),
    undoFollowUp: traced('undo_followup', actions.undoFollowUp, out => ({ ok: out.undone === true, ...(out.reason ? { reason: out.reason } : {}) })),
    saveWhatYouSee: traced('save_what_you_see', actions.saveWhatYouSee, out => ({ ok: out.saved === true, ...(out.reason ? { reason: out.reason } : {}) })),
  };
}
