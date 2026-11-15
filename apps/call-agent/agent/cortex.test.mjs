// Tests for the Cortex client and the model's memory actions, against a fake Cortex API.
// Run: node --test cortex.test.mjs   (no dependencies needed)
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { callIdFromIdentity, createCortexClient, isLocalUrl, localApiWarning, memoryActions } from './cortex.mjs';

// ---- a fake Cortex API: records requests, answers from a script
let server, base, seen, script;
before(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ method: req.method, path: req.url, body, key: req.headers['x-cortex-key'] ?? null });
    const scripted = script[`${req.method} ${req.url}`];
    const reply = (Array.isArray(scripted) ? (scripted.length > 1 ? scripted.shift() : scripted[0]) : scripted)
      ?? { status: 404, body: { error: { code: 'not_found', message: 'No route.' } } };
    if (reply.hang) return; // never answers: exercises the timeout
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); });
beforeEach(() => { seen = []; script = {}; });

const silence = console.log;
before(() => { console.log = () => {}; }); // the client logs JSON lines; keep test output clean
after(() => { console.log = silence; });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const fresh = () => ({ jpeg: JPEG, at: Date.now() });

describe('callIdFromIdentity', () => {
  it('strips the Chert bridge prefix', () => assert.equal(callIdFromIdentity('chert-bridge-abc123'), 'abc123'));
  it('keeps any other identity as is', () => assert.equal(callIdFromIdentity('someone'), 'someone'));
});

describe('client', () => {
  it('reports the call start and end with the call id', async () => {
    script['POST /calls/started'] = { body: { call_id: 'c1', started_at: 'x', ended_at: null } };
    script['POST /calls/ended'] = { body: { call_id: 'c1', started_at: 'x', ended_at: 'y' } };
    const client = createCortexClient({ baseUrl: base + '/' }); // a trailing slash is tolerated
    assert.equal((await client.callStarted('c1')).ok, true);
    assert.equal((await client.callEnded('c1')).ok, true);
    assert.deepEqual(seen.map(r => [r.method, r.path, r.body]), [
      ['POST', '/calls/started', { call_id: 'c1' }],
      ['POST', '/calls/ended', { call_id: 'c1' }],
    ]);
  });

  it('turns an HTTP error into a result, not an exception', async () => {
    const client = createCortexClient({ baseUrl: base });
    const res = await client.callStarted('c1'); // the fake has no such route yet: 404
    assert.deepEqual([res.ok, res.status, res.code], [false, 404, 'not_found']);
  });

  it('turns an unreachable API into a result, not an exception', async () => {
    const client = createCortexClient({ baseUrl: 'http://127.0.0.1:1', retryDelaysMs: [1, 1] });
    const res = await client.ask('anything');
    assert.deepEqual([res.ok, res.code], [false, 'unreachable']);
  });

  it('gives up on a slow API', async () => {
    script['POST /ask'] = { hang: true };
    const client = createCortexClient({ baseUrl: base, timeoutMs: 100 });
    const res = await client.ask('anything');
    assert.deepEqual([res.ok, res.code], [false, 'timeout']);
  });
});

describe('API key', () => {
  it('sends X-Cortex-Key on every request when a key is set, trimmed', async () => {
    script['POST /ask'] = { body: { answer: 'a', spoken: 'a', grounded: true, sources: [], receipt_id: 'r' } };
    script['GET /people'] = { body: { items: [] } };
    const client = createCortexClient({ baseUrl: base, apiKey: '  secret-key  ' });
    await client.ask('q'); await client.people(); await client.callStarted('c1');
    assert.deepEqual(seen.map(r => r.key), ['secret-key', 'secret-key', 'secret-key']);
  });
  it('sends no key header when none is set (local dev, open backend)', async () => {
    script['GET /people'] = { body: { items: [] } };
    await createCortexClient({ baseUrl: base, apiKey: '' }).people();
    await createCortexClient({ baseUrl: base, apiKey: undefined }).people();
    assert.deepEqual(seen.map(r => r.key), [null, null]);
  });
  it('reports a rejected key as unauthorized, and the model is told memory is unreachable', async () => {
    script['POST /ask'] = { status: 401, body: { error: { code: 'unauthorized', message: 'Missing or wrong Cortex API key.' } } };
    const client = createCortexClient({ baseUrl: base, apiKey: 'wrong' });
    assert.equal((await client.ask('q')).code, 'unauthorized');
    const act = memoryActions({ client, callId: 'c1', getLatestFrame: () => null });
    assert.match((await act.askMemory({ question: 'q' })).error, /not reachable/);
  });
});

describe('askMemory', () => {
  it('asks on the call channel and returns the spoken answer', async () => {
    script['POST /ask'] = { body: { answer: 'Long form.', spoken: 'Ash promised the deck on Friday.', grounded: true, sources: [{ id: 'm1' }], receipt_id: 'r1' } };
    const act = memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: () => null });
    const out = await act.askMemory({ question: 'What did Ash promise?' });
    assert.deepEqual(seen[0].body, { question: 'What did Ash promise?', channel: 'call' });
    assert.deepEqual(out, { answer: 'Ash promised the deck on Friday.', grounded: true, sources: 1 });
  });

  it('tells the model not to guess when memory has nothing', async () => {
    script['POST /ask'] = { body: { answer: 'x', spoken: 'I have nothing saved about that.', grounded: false, sources: [], receipt_id: 'r2' } };
    const act = memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: () => null });
    const out = await act.askMemory({ question: 'Where is the moon?' });
    assert.equal(out.grounded, false);
    assert.match(out.note, /do not guess/);
  });

  it('says memory is unreachable when the API is down, and rejects an empty question', async () => {
    const act = memoryActions({ client: createCortexClient({ baseUrl: 'http://127.0.0.1:1', retryDelaysMs: [1, 1] }), callId: 'c1', getLatestFrame: () => null });
    assert.match((await act.askMemory({ question: 'hi' })).error, /not reachable/);
    assert.match((await act.askMemory({ question: '  ' })).error, /No question/);
  });
});

describe('briefPerson', () => {
  const people = { items: [{ id: 'per_ash', name: 'Ash', company: 'Acme' }, { id: 'per_sam', name: 'Sam', company: null }, { id: 'per_sam2', name: 'Sam Lee', company: 'Beta' }] };
  const brief = { person: {}, spoken: 'Ash is the product lead at Acme.', bullets: ['Q4 launch'], open_promises: [], sources: [] };
  const make = () => memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: () => null });

  it('finds the person by name, case-insensitively, and returns the brief', async () => {
    script['GET /people'] = { body: people };
    script['GET /people/per_ash/brief'] = { body: brief };
    assert.deepEqual(await make().briefPerson({ name: 'ash' }), { found: true, brief: brief.spoken, bullets: ['Q4 launch'] });
  });

  it('prefers an exact match over a partial one', async () => {
    script['GET /people'] = { body: people };
    script['GET /people/per_sam/brief'] = { body: brief };
    assert.equal((await make().briefPerson({ name: 'Sam' })).found, true);
  });

  it('asks which one when the name is ambiguous, and says so when nobody matches', async () => {
    script['GET /people'] = { body: { items: [...people.items, { id: 'per_sam3', name: 'Sam', company: 'Gamma' }] } };
    assert.deepEqual((await make().briefPerson({ name: 'Sam' })).ambiguous, ['Sam', 'Sam from Gamma']);
    assert.equal((await make().briefPerson({ name: 'Zed' })).found, false);
  });
});

describe('saveWhatYouSee', () => {
  it('saves the latest picture as a call moment with the call id and the note', async () => {
    script['POST /moments'] = { status: 201, body: { id: 'mom_1' } };
    const act = memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: fresh });
    assert.deepEqual(await act.saveWhatYouSee({ note: 'Business card: Ash, Acme' }), { saved: true });
    const { body } = seen[0];
    assert.equal(body.source, 'call');
    assert.equal(body.call_id, 'c1');
    assert.equal(body.transcript, 'Shown on the call: Business card: Ash, Acme'); // labelled: it is not speech
    assert.equal(body.snapshot_base64, JPEG.toString('base64'));
    assert.ok(!Number.isNaN(Date.parse(body.ts)));
  });

  it('does not save a stale picture or when there is none (camera muted)', async () => {
    const client = createCortexClient({ baseUrl: base });
    const stale = memoryActions({ client, callId: 'c1', getLatestFrame: () => ({ jpeg: JPEG, at: 1000 }), now: () => 1000 + 6000 });
    assert.equal((await stale.saveWhatYouSee({})).reason, 'no_picture');
    const none = memoryActions({ client, callId: 'c1', getLatestFrame: () => null });
    assert.equal((await none.saveWhatYouSee({})).reason, 'no_picture');
    assert.equal(seen.length, 0, 'nothing is sent to Cortex');
  });

  it('reports paused or off-the-record capture (HTTP 409) and sends no note when none was given', async () => {
    script['POST /moments'] = { status: 409, body: { error: { code: 'paused', message: 'Capture is paused; nothing was stored.' } } };
    const act = memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: fresh });
    const out = await act.saveWhatYouSee({});
    assert.deepEqual([out.saved, out.reason], [false, 'paused']);
    assert.equal('transcript' in seen[0].body, false);
  });
});

describe('localApiWarning', () => {
  const HOSTED = 'https://api-production-47227cba.up.railway.app';
  it('treats only this-machine addresses as local', () => {
    for (const u of ['http://127.0.0.1:4010', 'http://localhost:8000', 'http://[::1]:8000', 'http://0.0.0.0:8000', 'http://127.1.2.3']) assert.equal(isLocalUrl(u), true, u);
    for (const u of [HOSTED, 'https://cortex.example.com', 'not a url', '']) assert.equal(isLocalUrl(u), false, u);
  });
  it('warns on a LiveKit worker that points at the local mock, set or left at the default', () => {
    assert.match(localApiWarning(undefined, true), /not set/);
    assert.match(localApiWarning('', true), /not set/);
    assert.match(localApiWarning('http://localhost:8000', true), /"http:\/\/localhost:8000"/);
  });
  it('stays quiet for a hosted address, and on a laptop in Chert rooms where the local mock is expected', () => {
    assert.equal(localApiWarning(HOSTED, true), null);
    assert.equal(localApiWarning(undefined, false), null);
    assert.equal(localApiWarning('http://127.0.0.1:4010', false), null);
  });
});

describe('retries on a restarting backend', () => {
  const OK = { body: { items: [] } };
  const BAD_GATEWAY = { status: 502, body: { error: { code: 'bad_gateway', message: 'Bad gateway.' } } };
  const quick = () => createCortexClient({ baseUrl: base, retryDelaysMs: [1, 1] });

  it('asks again after a 502 and returns the answer once the backend is back', async () => {
    script['GET /people'] = [BAD_GATEWAY, BAD_GATEWAY, OK];
    const res = await quick().people();
    assert.equal(res.ok, true);
    assert.equal(seen.length, 3, 'two retries, then success');
  });

  it('gives up after the retries and reports the failure, and the model is told memory is unreachable', async () => {
    script['POST /ask'] = BAD_GATEWAY;
    const client = quick();
    assert.equal((await client.ask('q')).status, 502);
    assert.equal(seen.length, 3, 'one try plus two retries');
    seen.length = 0;
    const act = memoryActions({ client, callId: 'c1', getLatestFrame: () => null });
    assert.match((await act.askMemory({ question: 'q' })).error, /not reachable/);
  });

  it('retries a refused connection and a 503 or 504 as well', async () => {
    let calls = 0;
    const flaky = createCortexClient({
      baseUrl: base, retryDelaysMs: [1, 1],
      fetchImpl: async () => {
        calls++;
        if (calls === 1) throw new TypeError('fetch failed');
        if (calls === 2) return new Response('{}', { status: 503 });
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    });
    assert.equal((await flaky.people()).ok, true);
    assert.equal(calls, 3);
  });

  it('never retries a timeout, a 4xx, or saving a picture', async () => {
    let timeouts = 0;
    const slow = createCortexClient({
      baseUrl: base, retryDelaysMs: [1, 1],
      fetchImpl: async () => { timeouts++; throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); },
    });
    assert.equal((await slow.ask('q')).code, 'timeout');
    assert.equal(timeouts, 1, 'a timeout may have run: not repeated');

    script['GET /people'] = { status: 401, body: { error: { code: 'unauthorized', message: 'no' } } };
    await quick().people();
    assert.equal(seen.length, 1, 'a 4xx would answer the same again');

    seen.length = 0;
    script['POST /moments'] = BAD_GATEWAY;
    const res = await quick().saveMoment({ callId: 'c1', jpeg: JPEG });
    assert.equal(res.status, 502);
    assert.equal(seen.length, 1, 'a repeated save could save the picture twice');
  });

  it('does not retry the call lifecycle reports (best effort)', async () => {
    script['POST /calls/started'] = BAD_GATEWAY;
    await quick().callStarted('c1');
    assert.equal(seen.length, 1);
  });
});

describe('tool call logging', () => {
  const capture = async fn => {
    const lines = [];
    const previous = console.log;
    console.log = (...a) => lines.push(a.join(' '));
    try { await fn(); } finally { console.log = previous; }
    return lines.map(l => JSON.parse(l)).filter(l => l.cortex === 'tool');
  };

  it('logs the tool, whether it worked and how long it took, and nothing the caller said or showed', async () => {
    script['POST /ask'] = { body: { answer: 'a', spoken: 'Sam promised the secret handshake.', grounded: true, sources: [{ id: 'm1' }], receipt_id: 'r' } };
    script['GET /people'] = { body: { items: [{ id: 'per_sam', name: 'Sam Rivera', company: 'Globex' }] } };
    script['GET /people/per_sam/brief'] = { body: { spoken: 'Sam is at Globex.', bullets: [] } };
    script['POST /moments'] = { status: 201, body: { id: 'm' } };
    const act = memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: fresh });
    const logged = await capture(async () => {
      await act.askMemory({ question: 'What did Sam promise about the handshake?' });
      await act.briefPerson({ name: 'Sam' });
      await act.saveWhatYouSee({ note: 'Green card with QR codes' });
    });
    assert.deepEqual(logged.map(l => [l.name, l.ok]), [['ask_memory', true], ['brief_person', true], ['save_what_you_see', true]]);
    assert.equal(logged[0].grounded, true);
    assert.equal(logged[1].found, true);
    assert.ok(logged.every(l => typeof l.ms === 'number'));
    const text = JSON.stringify(logged);
    for (const secret of ['handshake', 'Sam', 'Globex', 'QR codes', 'Green card']) assert.ok(!text.includes(secret), `the log must not contain "${secret}"`);
  });

  it('logs failures with a reason: a paused save, no picture, and memory unreachable', async () => {
    script['POST /moments'] = { status: 409, body: { error: { code: 'paused', message: 'Capture is paused.' } } };
    const client = createCortexClient({ baseUrl: 'http://127.0.0.1:1', retryDelaysMs: [1, 1] });
    const paused = memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: fresh });
    const none = memoryActions({ client, callId: 'c1', getLatestFrame: () => null });
    const logged = await capture(async () => {
      await paused.saveWhatYouSee({});
      await none.saveWhatYouSee({});
      await none.askMemory({ question: 'q' });
    });
    assert.deepEqual(logged.map(l => [l.name, l.ok, l.reason]), [
      ['save_what_you_see', false, 'paused'],
      ['save_what_you_see', false, 'no_picture'],
      ['ask_memory', false, undefined],
    ]);
  });
});

describe('follow-up email by voice', () => {
  const people = { items: [{ id: 'per_ash', name: 'Ash', company: 'Acme' }, { id: 'per_sam', name: 'Sam Rivera', company: 'Globex' }] };
  const draft = { id: 'act_1', type: 'follow_up_email', status: 'proposed', person_id: 'per_ash', draft: { to: 'inbox@example.com', subject: 'Great meeting you', body: 'Hi Ash,\n\nGreat meeting  you today.\n\nTalk soon.' } };
  const sentBody = (seconds = 30) => ({ body: { action: { ...draft, status: 'sent' }, receipt: { undo: { available: true, until: new Date(Date.now() + seconds * 1000).toISOString() } } } });
  const make = () => memoryActions({ client: createCortexClient({ baseUrl: base }), callId: 'c1', getLatestFrame: () => null });
  const requests = path => seen.filter(r => r.path === path);

  it('drafts for the named person, reads back a gist and sends nothing', async () => {
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: draft };
    const out = await make().draftFollowUp({ name: 'ash' });
    assert.deepEqual(requests('/actions/propose')[0].body, { type: 'follow_up_email', person_id: 'per_ash' });
    assert.equal(out.drafted, true);
    assert.equal(out.subject, 'Great meeting you');
    assert.equal(out.gist, 'Hi Ash, Great meeting you today. Talk soon.'); // whitespace squeezed for speech
    assert.equal(requests('/actions/act_1/confirm').length, 0);
    assert.equal(JSON.stringify(out).includes('inbox@example.com'), false); // the address is never read aloud
  });

  it('will not send without a draft, or without the caller\'s explicit yes', async () => {
    const act = make();
    assert.equal((await act.sendFollowUp({ caller_said_yes: true })).reason, 'no_draft');
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: draft };
    await act.draftFollowUp({ name: 'Ash' });
    for (const said of [false, undefined, 'yes', 1]) assert.equal((await act.sendFollowUp({ caller_said_yes: said })).reason, 'needs_yes');
    assert.equal(requests('/actions/act_1/confirm').length, 0);
  });

  it('sends on a yes with deliver send, and reports the undo window', async () => {
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: draft };
    script['POST /actions/act_1/confirm'] = sentBody(30);
    const act = make();
    await act.draftFollowUp({ name: 'Ash' });
    const out = await act.sendFollowUp({ caller_said_yes: true });
    assert.deepEqual(requests('/actions/act_1/confirm')[0].body, { deliver: 'send' });
    assert.equal(out.sent, true);
    assert.ok(out.undo_seconds >= 28 && out.undo_seconds <= 30);
    assert.equal((await act.sendFollowUp({ caller_said_yes: true })).reason, 'no_draft'); // one draft, one send
    assert.equal(requests('/actions/act_1/confirm').length, 1);
  });

  it('says plainly when sending is switched off and the email was only saved as a draft', async () => {
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: draft };
    script['POST /actions/act_1/confirm'] = { body: { action: { ...draft, status: 'draft_saved' }, receipt: { undo: { available: true } } } };
    const act = make();
    await act.draftFollowUp({ name: 'Ash' });
    const out = await act.sendFollowUp({ caller_said_yes: true });
    assert.equal(out.sent, false);
    assert.equal(out.saved_as_draft, true);
  });

  it('undoes the email sent on this call, and says when it is too late or nothing was sent', async () => {
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: draft };
    script['POST /actions/act_1/confirm'] = sentBody();
    const act = make();
    assert.equal((await act.undoFollowUp()).reason, 'nothing_to_undo');
    await act.draftFollowUp({ name: 'Ash' });
    await act.sendFollowUp({ caller_said_yes: true });
    script['POST /actions/act_1/undo'] = { body: { action: { ...draft, status: 'undone' }, receipt: {} } };
    assert.equal((await act.undoFollowUp()).undone, true);
    assert.equal((await act.undoFollowUp()).reason, 'nothing_to_undo');

    const late = make();
    script['POST /actions/act_1/undo'] = { status: 409, body: { error: { code: 'undo_expired', message: 'closed' } } };
    await late.draftFollowUp({ name: 'Ash' });
    await late.sendFollowUp({ caller_said_yes: true });
    const out = await late.undoFollowUp();
    assert.deepEqual([out.undone, out.reason], [false, 'undo_expired']);
  });

  it('does not draft for an unknown or ambiguous name, or when there is no address, and never sends then', async () => {
    script['GET /people'] = { body: { items: [...people.items, { id: 'per_sam2', name: 'Sam Rivera', company: 'Beta' }] } };
    const act = make();
    assert.equal((await act.draftFollowUp({ name: 'Zed' })).found, false);
    assert.equal((await act.draftFollowUp({ name: 'Sam Rivera' })).ambiguous.length, 2);
    assert.equal((await act.draftFollowUp({ name: '  ' })).error, 'No name was given.');
    assert.equal(requests('/actions/propose').length, 0);
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: { ...draft, draft: { ...draft.draft, to: '' } } };
    assert.equal((await act.draftFollowUp({ name: 'Ash' })).reason, 'no_address');
    assert.equal((await act.sendFollowUp({ caller_said_yes: true })).reason, 'no_draft');
  });

  it('handles an unreachable Cortex and a send that fails without crashing the call', async () => {
    const down = memoryActions({ client: createCortexClient({ baseUrl: 'http://127.0.0.1:1', retryDelaysMs: [1, 1] }), callId: 'c1', getLatestFrame: () => null });
    assert.match((await down.draftFollowUp({ name: 'Ash' })).error, /not reachable/);
    script['GET /people'] = { body: people };
    script['POST /actions/propose'] = { status: 201, body: draft };
    script['POST /actions/act_1/confirm'] = { status: 500, body: { error: { code: 'internal', message: 'boom' } } };
    const act = make();
    await act.draftFollowUp({ name: 'Ash' });
    const out = await act.sendFollowUp({ caller_said_yes: true });
    assert.equal(out.sent, false);
    assert.equal((await act.undoFollowUp()).reason, 'nothing_to_undo'); // a failed send leaves nothing to undo
  });
});
