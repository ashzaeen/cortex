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
    seen.push({ method: req.method, path: req.url, body });
    const reply = script[`${req.method} ${req.url}`] ?? { status: 404, body: { error: { code: 'not_found', message: 'No route.' } } };
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
    const client = createCortexClient({ baseUrl: 'http://127.0.0.1:1' });
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
    const act = memoryActions({ client: createCortexClient({ baseUrl: 'http://127.0.0.1:1' }), callId: 'c1', getLatestFrame: () => null });
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
    assert.equal(body.transcript, 'Business card: Ash, Acme');
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
