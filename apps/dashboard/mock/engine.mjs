// The stateful Cortex mock as a plain engine: no Node APIs, so it runs behind the HTTP mock
// (mock/server.mjs, `make dev`) and inside the browser for the public demo (/demo, lib/demo.ts).
// It fakes the backend's behaviour with simple rules; the real backend replaces it.
//
//   const engine = createEngine({ load, ... });
//   engine.handle("GET", "/moments?limit=10")      -> { status, body }
//   engine.subscribe(({ type, at, data }) => ...)  -> unsubscribe
//
// Mock-only extras (not in the contract): GET /_demo, POST /_demo/next, /_demo/play, /_demo/reset,
// and the events `demo.step` and `person.updated` (re-meeting a known person; proposed in #43).

const UNDO_WINDOW_MS = 60_000;
const STOP = new Set("a an the and or of to in on at for with me my i you your what did is are was were who whom about from by this that it do does any open where when".split(" "));
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;

/**
 * @param {object} opts
 * @param {() => object} opts.load        returns fresh data: { moments, people, promises, actions, receipts, modes }
 * @param {string} [opts.anchor]          "YYYY-MM-DD": the profile's "today". Shifts every date so it lands on the real today.
 * @param {boolean} [opts.suggestions]    seed one suggestion per mode from the backend fixtures (fixture ids)
 * @param {{name: string, email: string}} [opts.owner]  the demo persona, used to sign emails
 * @param {{booth?: string, card?: string}} [opts.assets] snapshots used by the Ash demo script
 */
export function createEngine({ load, anchor = null, suggestions = false, owner = null, assets = {} }) {
  let db;
  let playing = null;
  const listeners = new Set();
  const now = () => new Date().toISOString();
  const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  const activeMode = () => db.modes.find((m) => m.active)?.id ?? "focus";
  const booth = assets.booth ?? "fixtures/snapshots/placeholder-booth.svg";
  const card = assets.card ?? booth;

  function emit(type, data) {
    const msg = { type, at: now(), data };
    for (const fn of listeners) fn(msg);
  }

  // ------------------------------------------------------------ state
  function fresh() {
    const d = JSON.parse(JSON.stringify(load()));
    if (anchor) rebase(d, anchor);
    return { ...d, privacy: { state: "capturing", since: now() }, demoIndex: 0, calls: {}, activeCall: null };
  }

  // Shift every timestamp by whole days so the profile's anchor day becomes today (local time).
  // Times of day stay put; weekday words in transcripts ("by Friday") are recomputed into due dates.
  function rebase(d, anchorDay) {
    const [y, m, day] = anchorDay.split("-").map(Number);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let delta = Math.round((today - new Date(y, m - 1, day)) / DAY_MS) * DAY_MS;
    // Never put a moment in the future: early in the day, the anchor day's later moments would land
    // after "now", so move the whole week back a day until the newest moment is in the past.
    const newest = Math.max(...d.moments.map((x) => Date.parse(x.ts)).filter(Number.isFinite));
    while (Number.isFinite(newest) && newest + delta > Date.now()) delta -= DAY_MS;
    const shift = (iso) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : iso);
    const shiftDate = (s) => (s ? localDate(new Date(new Date(`${s}T12:00:00`).getTime() + delta)) : s);
    for (const x of d.moments) x.ts = shift(x.ts);
    for (const r of d.receipts) { r.created_at = shift(r.created_at); r.undo.until = shift(r.undo.until); }
    for (const p of d.promises) {
      const src = d.moments.find((x) => x.id === p.source_moment_id);
      const said = src && p.due.text && dueFrom(p.due.text, src.ts);
      p.due.date = said?.date ?? shiftDate(p.due.date);
    }
  }

  // Mode suggestions (design decision D18): each mode suggests its own action. Built from the
  // backend fixtures' ids; a demo profile ships its own suggestions in actions.json instead.
  function seedModeSuggestions() {
    const slide = db.moments.find((m) => m.id === "mom_seed_006");
    const board = db.moments.find((m) => m.id === "mom_seed_005");
    const sam = db.promises.find((p) => p.id === "prm_seed_001");
    const add = (a) => db.actions.push({ id: id("act"), status: "proposed", ...a });
    if (slide) add({ type: "flashcards", mode: "student", person_id: null, title: "Turn the lecture slide into flashcards",
      summary: "Cards from the CSE 3310 project schedule you captured, ready to review tonight.", source_moment_ids: [slide.id] });
    if (sam) add({ type: "reminder", mode: "life", person_id: sam.person_id, title: "Remind me about Sam's application link",
      summary: "Sam promised the internship application link by Wednesday. A reminder tomorrow morning, with a nudge if nothing has arrived.", source_moment_ids: [sam.source_moment_id] });
    if (board) add({ type: "read_aloud", mode: "assist", person_id: null, title: "Read the whiteboard aloud",
      summary: "Reads the text on the Initech whiteboard snapshot in order, then offers to describe the diagram.", source_moment_ids: [board.id] });
  }

  function reset() {
    if (playing) { clearInterval(playing); playing = null; }
    db = fresh();
    if (suggestions) seedModeSuggestions();
  }

  // ------------------------------------------------------------ calls (D-10, mirrors apps/backend/core/calls.py)
  const MAX_CALL_MS = 6 * 60 * 1000; // Chert caps calls at 5 minutes; no end after 6 counts as ended
  function callEnd(callId, at = now()) {
    const c = db.calls[callId];
    if (!c) return null;
    if (!c.ended_at) { c.ended_at = at; emit("call.ended", { ...c }); }
    if (db.activeCall === callId) db.activeCall = null;
    return c;
  }
  function callStart(callId) {
    const cur = db.activeCall && db.calls[db.activeCall];
    if (cur && Date.now() - Date.parse(cur.started_at) > MAX_CALL_MS) callEnd(cur.call_id, new Date(Date.parse(cur.started_at) + MAX_CALL_MS).toISOString());
    if (db.activeCall === callId) return db.calls[callId]; // idempotent
    if (db.activeCall) callEnd(db.activeCall); // one call at a time
    const c = { call_id: callId, started_at: now(), ended_at: null };
    db.calls[callId] = c; db.activeCall = callId;
    emit("call.started", { ...c });
    return c;
  }
  function callCurrent() {
    const cur = db.activeCall && db.calls[db.activeCall];
    if (cur && Date.now() - Date.parse(cur.started_at) > MAX_CALL_MS) { callEnd(cur.call_id, new Date(Date.parse(cur.started_at) + MAX_CALL_MS).toISOString()); return null; }
    return cur || null;
  }

  // ------------------------------------------------------------ skills (fake rules)
  function dueFrom(text, fromIso) {
    const m = text.toLowerCase().match(/\b(today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (!m) return { date: null, inferred: false, text: null };
    const d = new Date(fromIso);
    if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
    else if (m[1] !== "today" && m[1] !== "tonight") {
      let diff = (DAYS.indexOf(m[1]) - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
    }
    return { date: localDate(d), inferred: false, text: m[0][0].toUpperCase() + m[0].slice(1) };
  }

  function ingest(body) {
    if (db.privacy.state !== "capturing") return { error: [409, "capture_paused", `Capture is ${db.privacy.state}; nothing was stored.`] };
    if (!body || !body.ts || !body.source) return { error: [400, "bad_request", "ts and source are required."] };
    const transcript = body.transcript ?? (body.audio_base64 ? "(audio clip; the mock does not transcribe)" : null);
    const snapshot = body.snapshot_url ?? (body.snapshot_base64 ? `data:image/jpeg;base64,${body.snapshot_base64}` : null);
    const moment = {
      id: id("mom"), ts: body.ts, source: body.source, mode: body.mode ?? activeMode(),
      transcript, caption: body.caption ?? (snapshot ? "Snapshot (the mock does not caption images)" : null),
      snapshot_url: snapshot, place: body.place ?? null, person_ids: [], off_record: false,
    };
    db.moments.push(moment);

    // Network skill: "This is <Name> from <Company>"
    const intro = transcript?.match(/\b[Tt]his is ([A-Z][\w'-]*(?: [A-Z][\w'-]*)?) from ([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)?)/);
    let person = null;
    if (intro) {
      person = db.people.find((p) => p.name.toLowerCase() === intro[1].toLowerCase());
      if (person) {
        // Met again: link the moment to the existing card; the card keeps its first meeting as proof.
        moment.person_ids.push(person.id);
        emit("moment.created", moment);
        emit("person.updated", person);
        return { moment };
      }
      person = {
        id: `per_${intro[1].toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, name: intro[1], company: intro[2].replace(/[.,]$/, ""),
        role: null, consent: "introduction", introduced_moment_id: moment.id, topics: [], notes: null, name_confidence: 0.92,
      };
      db.people.push(person);
      moment.person_ids.push(person.id);
      emit("moment.created", moment);
      emit("person.created", person);
      return { moment };
    }
    // Otherwise link to the person seen most recently in the last 10 minutes.
    const recent = [...db.moments].reverse().find((m) => m !== moment && m.person_ids.length && Math.abs(Date.parse(moment.ts) - Date.parse(m.ts)) < 600_000);
    if (recent) person = db.people.find((p) => p.id === recent.person_ids[0]);
    if (person && !moment.person_ids.includes(person.id)) moment.person_ids.push(person.id);
    emit("moment.created", moment);

    // Waiting-on tracker: "I'll send you X <day>"
    const promise = transcript?.match(/\bI(?:'ll| will) (send|share|email|get|give|intro\w*) (?:you )?(.+?)(?:\s+(?:by|on|before))?\s*(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)?[.!]?$/i);
    if (promise && person) {
      const what = `${promise[1][0].toUpperCase()}${promise[1].slice(1)} ${promise[2].replace(/^(the|a)\b/i, (w) => w.toLowerCase())}`.trim();
      const p = { id: id("prm"), direction: "waiting_on", person_id: person.id, what, due: dueFrom(transcript, moment.ts), status: "proposed", source_moment_id: moment.id };
      db.promises.push(p);
      emit("promise.proposed", p);
    }
    return { moment };
  }

  function receipt(kind, summary, sourceIds, actionId = null, undo = false) {
    const r = {
      id: id("rcp"), kind, created_at: now(), summary, action_id: actionId, source_moment_ids: sourceIds,
      undo: { available: undo, until: undo ? new Date(Date.now() + UNDO_WINDOW_MS).toISOString() : null },
    };
    db.receipts.push(r);
    emit("receipt.created", r);
    return r;
  }

  // Words, with a light stem so "park" finds "parked" and "demos" finds "demo".
  const stem = (w) => w.replace(/(ing|ed|es|s)$/, "") || w;
  const words = (s) => (s ?? "").toLowerCase().match(/[a-z0-9']+/g)?.filter((w) => !STOP.has(w) && w.length > 1).map(stem) ?? [];
  function search(q, limit = 5) {
    const qw = new Set(words(q));
    return db.moments
      .map((m) => {
        const names = m.person_ids.map((pid) => db.people.find((p) => p.id === pid)?.name ?? "").join(" ");
        // What was said counts double: it is what the user asks about.
        const said = new Set(words(m.transcript));
        const seen = new Set(words(`${m.caption} ${m.place} ${names}`));
        const score = [...qw].reduce((s, w) => s + (said.has(w) ? 1 : seen.has(w) ? 0.5 : 0), 0) / Math.max(qw.size, 1);
        return { moment: m, score: Math.round(Math.min(score, 1) * 100) / 100 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.moment.ts) - Date.parse(a.moment.ts))
      .slice(0, limit);
  }
  const fmtDue = (due) => (due.date ? `${due.text ?? ""} (${new Date(due.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`.trim() : due.text ?? "no date");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const personIn = (text) => db.people.find((p) => {
    const parts = p.name.split(" ").filter((w) => !/\.$/.test(w)); // skip titles like "Prof."
    return parts.some((w) => new RegExp(`\\b${reEsc(w)}\\b`, "i").test(text));
  });

  function ask(question) {
    const person = personIn(question);
    if (person && /promis|owe|open|waiting/i.test(question)) {
      const open = db.promises.filter((p) => p.person_id === person.id && (p.status === "confirmed" || p.status === "proposed"));
      if (open.length) {
        const first = person.name.split(" ").filter((w) => !/\.$/.test(w))[0];
        const list = open.map((p) => `${p.direction === "waiting_on" ? `${first} owes you` : `You owe ${first}`}: ${p.what.toLowerCase()}, due ${fmtDue(p.due)}`);
        const sources = open.map((p) => db.moments.find((m) => m.id === p.source_moment_id)).filter(Boolean);
        const spoken = open.length === 1 && open[0].direction === "waiting_on"
          ? `${first} promised to ${open[0].what.toLowerCase()} by ${open[0].due.text ?? "no set date"}.`
          : list.join(". ") + ".";
        const r = receipt("answer", `Answered "${question}" from ${sources.length} moment(s).`, sources.map((m) => m.id));
        return { answer: list.join("; ") + ".", spoken, grounded: true, sources, receipt_id: r.id };
      }
    }
    const hits = search(question, 3);
    if (!hits.length) {
      const r = receipt("answer", `No memory matched "${question}".`, []);
      return { answer: "I don't have anything about that in memory.", spoken: "I don't have that.", grounded: false, sources: [], receipt_id: r.id };
    }
    const top = hits[0].moment;
    const when = new Date(top.ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const r = receipt("answer", `Answered "${question}" from ${hits.length} moment(s).`, hits.map((h) => h.moment.id));
    return { answer: `On ${when}: "${top.transcript ?? top.caption}"`, spoken: top.transcript ?? top.caption ?? "", grounded: true, sources: hits.map((h) => h.moment), receipt_id: r.id };
  }

  function brief(person) {
    const moments = db.moments.filter((m) => m.person_ids.includes(person.id)).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const open = db.promises.filter((p) => p.person_id === person.id && ["proposed", "confirmed"].includes(p.status));
    if (!moments.length) return { person, spoken: `I have nothing on file about ${person.name}.`, bullets: [], open_promises: [], sources: [] };
    const first = moments[0];
    const last = moments.at(-1);
    const met = new Date(first.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const openText = open.length ? open.map((p) => (p.direction === "waiting_on" ? `${person.name} owes you ${p.what.toLowerCase()} by ${p.due.text ?? "no set date"}` : `you owe ${person.name} ${p.what.toLowerCase()}`)).join("; ") : "nothing is open";
    const bullets = [
      `${person.name}${person.company ? `, ${person.company}` : ""}; met ${met}${first.place ? ` at ${first.place}` : ""}`,
      `Last said: "${(last.transcript ?? last.caption ?? "").slice(0, 80)}"`,
      open.length ? `Open: ${open.map((p) => p.what).join("; ")}` : "Nothing open",
    ];
    const spoken = `${person.name}${person.company ? `, ${person.company}` : ""}. You met on ${met}${first.place ? ` at ${first.place}` : ""}. Most recently: ${last.transcript ?? last.caption}. Open: ${openText}.`;
    receipt("answer", `Briefed on ${person.name}.`, moments.map((m) => m.id));
    return { person, spoken, bullets, open_promises: open, sources: moments };
  }

  function proposeEmail(personId, sourceIds) {
    const person = db.people.find((p) => p.id === personId);
    if (!person) return null;
    const open = db.promises.filter((p) => p.person_id === personId && p.status === "confirmed" && p.direction === "waiting_on");
    const srcs = sourceIds?.length ? sourceIds : db.moments.filter((m) => m.person_ids.includes(personId)).map((m) => m.id);
    const first = person.name.split(" ").filter((w) => !/\.$/.test(w))[0];
    const sign = owner?.name?.split(" ")[0] ?? "Cortex user";
    const a = {
      id: id("act"), type: "follow_up_email", status: "proposed", mode: "focus", person_id: personId,
      title: `Draft a follow-up to ${first}`,
      summary: `Thanks for the chat today.${open.length ? ` You mentioned you would ${open[0].what.toLowerCase()} by ${open[0].due.text ?? "soon"}, and Cortex will watch for it.` : ""} Could we find 20 minutes next week?`,
      draft: {
        to: `${first.toLowerCase()}@${(person.company ?? "example").toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
        subject: `Great meeting you${person.company ? `, from ${person.company}` : ""}`,
        body: `Hi ${first},\n\nGreat to see you today.${open.length ? ` Looking forward to ${open[0].what.replace(/^Send /i, "").toLowerCase()} by ${open[0].due.text ?? "soon"}.` : ""}\n\nBest,\n${sign}`,
      },
      source_moment_ids: srcs.length ? srcs : [db.moments.at(-1).id],
    };
    db.actions.push(a);
    emit("action.proposed", a);
    return a;
  }

  function confirmPromise(p) {
    p.status = "confirmed";
    emit("promise.confirmed", p);
    const who = db.people.find((x) => x.id === p.person_id);
    if (p.direction === "waiting_on" && who && !db.actions.some((a) => a.type === "reminder" && a.source_moment_ids.includes(p.source_moment_id))) {
      const a = { id: id("act"), type: "reminder", status: "proposed", mode: "life", person_id: who.id,
        title: `Remind me when ${p.what.replace(/^Send /i, "").toLowerCase()} is due`,
        summary: `A reminder ${p.due.text ? `on ${p.due.text}` : "soon"} about ${p.what.toLowerCase()} from ${who.name}, with a nudge if nothing has arrived.`,
        source_moment_ids: [p.source_moment_id] };
      db.actions.push(a);
      emit("action.proposed", a);
    }
    return p;
  }

  // Calendar, tasks, Drive and texts (ACT-5 to ACT-9): the mock never calls Google or Chert, so these
  // behave like the backend's dry run (external: null).
  const PAYLOAD = { calendar_event: "event", reminder: "task", flashcards: "doc", notes: "doc", message: "message" };
  const DEFAULT_MODE = { calendar_event: "focus", reminder: "life", flashcards: "student", notes: "student", message: "life", read_aloud: "assist" };
  function proposeOther(body) {
    const key = PAYLOAD[body.type];
    if (!(body.type in DEFAULT_MODE)) return err(400, "bad_request", "Unknown action type.");
    const payload = key ? body[key] : undefined;
    const title = body.title ?? payload?.title ?? (body.type === "message" && payload?.to ? `Text ${payload.to}` : null);
    const ids = (body.source_moment_ids ?? []).filter((x) => db.moments.some((mo) => mo.id === x));
    if (!title) return err(400, "bad_request", `title is required for ${body.type}.`);
    if (!ids.length) return err(400, "bad_request", "source_moment_ids must name at least one stored moment.");
    if ((body.type === "calendar_event" || body.type === "message") && !payload) return err(400, "bad_request", `${key} is required for ${body.type}.`);
    const a = { id: id("act"), type: body.type, status: "proposed", mode: body.mode ?? DEFAULT_MODE[body.type], title,
      person_id: body.person_id ?? null, source_moment_ids: ids };
    if (body.summary) a.summary = body.summary;
    if (key) a[key] = payload ?? (key === "task" ? { title, notes: body.summary ?? null, due: null } : { title, body: body.summary ?? title });
    db.actions.push(a);
    emit("action.proposed", a);
    return ok(201, a);
  }

  function confirmAction(a, deliver) {
    const person = db.people.find((p) => p.id === a.person_id);
    let summary;
    if (a.type === "follow_up_email") {
      a.status = deliver === "draft" ? "draft_saved" : "sent";
      summary = `${deliver === "draft" ? "Saved a draft to" : "Sent to"} ${person?.name ?? "contact"}${person?.company ? ` at ${person.company}` : ""}`;
    } else if (a.type === "message") {
      a.status = "draft_saved"; a.external = null;
      summary = `Saved the text to ${a.message.to} as a draft. (Dry run: texting is off.)`;
    } else {
      a.status = "done";
      if (a.type in PAYLOAD) a.external = null;
      summary = { flashcards: "Cards added to your deck", reminder: "Reminder set", read_aloud: "Reading aloud now",
        calendar_event: `Added “${a.title}” to your calendar`, notes: `Saved the notes “${a.title}”` }[a.type];
    }
    emit("action.updated", a);
    return { action: a, receipt: receipt("action", summary, a.source_moment_ids, a.id, true) };
  }

  // ------------------------------------------------------------ demo driver (the Ash script)
  const ashPerson = () => db.people.find((p) => p.name === "Ash");
  const DEMO = [
    { beat: "Meet", label: 'Glasses hear "This is Ash from Acme."', you: "Watch Ash's card light up.",
      run: () => ingest({ ts: now(), source: "glasses", transcript: "This is Ash from Acme.", snapshot_url: booth, place: "HackUTA expo hall" }) },
    { beat: "Promise", label: `Ash says "I'll send you the deck Friday."`, you: "Tap Track It on the promise chip.",
      run: () => ingest({ ts: now(), source: "glasses", transcript: "I'll send you the deck Friday.", snapshot_url: booth, place: "HackUTA expo hall" }) },
    { beat: "Promise", label: "Confirm the promise chip", you: "(The driver taps Track It if you have not.)",
      run: () => { const p = db.promises.find((x) => x.status === "proposed" && x.person_id === ashPerson()?.id); if (p) confirmPromise(p); } },
    { beat: "Ask", label: 'Ask "What did Ash promise me?"', you: "Ask it in Ask Your Memory.",
      run: () => ask("What did Ash promise me?") },
    { beat: "Brief", label: 'Ask "Brief me on Ash."', you: "Tap Brief Me on Ash's card in People.",
      run: () => { const p = ashPerson(); if (p) brief(p); } },
    { beat: "Act", label: "Cortex proposes a follow-up email", you: "Approve it in Focus, then try Undo.",
      run: () => { const p = ashPerson(); if (p && !db.actions.some((a) => a.type === "follow_up_email" && a.person_id === p.id && a.status === "proposed")) proposeEmail(p.id); } },
    { beat: "Act", label: "Approve and send the email", you: "(The driver approves it if you have not.)",
      run: () => { const a = db.actions.find((x) => x.type === "follow_up_email" && x.status === "proposed" && x.person_id === ashPerson()?.id); if (a) confirmAction(a, "send"); } },
    { beat: "Call", label: "FaceTime caller shows a business card", you: "Watch the call moment arrive.",
      run: () => { callStart("call_demo"); ingest({ ts: now(), source: "call", call_id: "call_demo", transcript: "Here's Ash's business card.", caption: "Business card: Ash, Product Lead, Acme, ash@acme.example", snapshot_url: card }); } },
    { beat: "Call", label: 'Caller asks "What is open with Ash?"', you: "Hear the answer from memory.",
      run: () => { ask("What is open with Ash?"); callEnd("call_demo"); } },
  ];
  const demoState = () => ({ index: db.demoIndex, total: DEMO.length, owner: owner?.name ?? null,
    steps: DEMO.map(({ beat, label, you }, i) => ({ i, beat, label, you, done: i < db.demoIndex })) });
  function demoNext() {
    if (db.demoIndex >= DEMO.length) return false;
    DEMO[db.demoIndex].run();
    db.demoIndex++;
    emit("demo.step", demoState());
    return true;
  }
  function demoPlay(ms = 2500) {
    if (playing) return;
    playing = setInterval(() => { if (!demoNext()) { clearInterval(playing); playing = null; } }, ms);
    demoNext();
  }

  // ------------------------------------------------------------ routes
  const ok = (status, body) => ({ status, body });
  const err = (status, code, message) => ({ status, body: { error: { code, message } } });

  function handle(method, target, body = null) {
    const url = new URL(target, "http://mock");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const q = (k) => url.searchParams.get(k);
    const m = method.toUpperCase();
    let mm;

    if (m === "GET" && p === "/health") return ok(200, { ok: true });
    if (p === "/moments" && m === "POST") {
      const out = ingest(body);
      return out.error ? err(...out.error) : ok(201, out.moment);
    }
    if (p === "/moments" && m === "GET") {
      const since = q("since"); const limit = Number(q("limit") ?? 50);
      return ok(200, { items: db.moments.filter((x) => !since || x.ts > since).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit) });
    }
    if (p === "/moments/search" && m === "GET") {
      if (!q("q")) return err(400, "bad_request", "q is required.");
      return ok(200, { results: search(q("q"), Number(q("limit") ?? 5)) });
    }
    if ((mm = p.match(/^\/moments\/([^/]+)$/)) && m === "DELETE") {
      const i = db.moments.findIndex((x) => x.id === decodeURIComponent(mm[1]));
      if (i < 0) return err(404, "not_found", "No such moment.");
      const [gone] = db.moments.splice(i, 1);
      const dropped = db.promises.filter((x) => x.source_moment_id === gone.id).length;
      db.promises = db.promises.filter((x) => x.source_moment_id !== gone.id);
      for (const r of db.receipts) r.source_moment_ids = r.source_moment_ids.filter((x) => x !== gone.id);
      for (const a of db.actions) a.source_moment_ids = a.source_moment_ids.filter((x) => x !== gone.id);
      emit("moment.deleted", { id: gone.id });
      return ok(200, receipt("deletion", `Deleted 1 moment and its transcript, snapshot${dropped ? ` and ${dropped} promise(s)` : ""}.`, []));
    }
    if (p === "/ask" && m === "POST") {
      if (!body?.question || !body?.channel) return err(400, "bad_request", "question and channel are required.");
      return ok(200, ask(body.question));
    }
    if (p === "/people" && m === "GET") return ok(200, { items: db.people });
    if (p === "/people" && m === "POST") {
      if (!body?.name || !body?.introduced_moment_id) return err(400, "bad_request", "name and introduced_moment_id are required.");
      const person = { id: id("per"), name: body.name, company: body.company ?? null, role: null, consent: "introduction", introduced_moment_id: body.introduced_moment_id, topics: [], notes: null, name_confidence: 1 };
      db.people.push(person); emit("person.created", person);
      return ok(201, person);
    }
    if ((mm = p.match(/^\/people\/([^/]+)\/brief$/)) && m === "GET") {
      const person = db.people.find((x) => x.id === decodeURIComponent(mm[1]));
      return person ? ok(200, brief(person)) : err(404, "not_found", "No such person.");
    }
    if (p === "/promises" && m === "GET") {
      const f = Object.fromEntries(["status", "direction", "person_id"].map((k) => [k, q(k)]));
      return ok(200, { items: db.promises.filter((x) => Object.entries(f).every(([k, v]) => !v || x[k] === v)) });
    }
    if (p === "/promises" && m === "POST") {
      if (!body?.direction || !body?.person_id || !body?.what || !body?.source_moment_id) return err(400, "bad_request", "direction, person_id, what and source_moment_id are required.");
      const src = db.moments.find((x) => x.id === body.source_moment_id);
      const pr = { id: id("prm"), direction: body.direction, person_id: body.person_id, what: body.what, due: body.due_text ? dueFrom(body.due_text, src?.ts ?? now()) : { date: null, inferred: false, text: null }, status: "proposed", source_moment_id: body.source_moment_id };
      db.promises.push(pr); emit("promise.proposed", pr);
      return ok(201, pr);
    }
    if ((mm = p.match(/^\/promises\/([^/]+)\/confirm$/)) && m === "POST") {
      const pr = db.promises.find((x) => x.id === decodeURIComponent(mm[1]));
      return pr ? ok(200, confirmPromise(pr)) : err(404, "not_found", "No such promise.");
    }
    if (p === "/actions" && m === "GET") {
      const status = q("status"); const mode = q("mode");
      return ok(200, { items: db.actions.filter((a) => (!status || a.status === status) && (!mode || a.mode === mode)) });
    }
    if (p === "/actions/propose" && m === "POST") {
      if (body?.type && body.type !== "follow_up_email") return proposeOther(body);
      const a = body?.person_id && proposeEmail(body.person_id, body.source_moment_ids);
      return a ? ok(201, a) : err(400, "bad_request", "A known person_id is required.");
    }
    if ((mm = p.match(/^\/actions\/([^/]+)\/confirm$/)) && m === "POST") {
      const a = db.actions.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!a) return err(404, "not_found", "No such action.");
      if (a.status !== "proposed") return err(409, "not_proposed", `Action is already ${a.status}.`);
      if (body?.draft) a.draft = { ...a.draft, ...body.draft };
      return ok(200, confirmAction(a, body?.deliver === "draft" ? "draft" : body?.deliver ?? "send"));
    }
    if ((mm = p.match(/^\/actions\/([^/]+)\/undo$/)) && m === "POST") {
      const a = db.actions.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!a) return err(404, "not_found", "No such action.");
      const orig = [...db.receipts].reverse().find((r) => r.action_id === a.id && r.undo.available);
      if (!orig || Date.parse(orig.undo.until) < Date.now()) return err(409, "undo_expired", "The undo window has closed.");
      orig.undo = { available: false, until: orig.undo.until };
      a.status = "undone"; emit("action.updated", a);
      return ok(200, { action: a, receipt: receipt("action", `Undid: ${orig.summary}`, a.source_moment_ids, a.id) });
    }
    if (p === "/receipts" && m === "GET") return ok(200, { items: [...db.receipts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) });
    if (p === "/privacy" && m === "GET") return ok(200, db.privacy);
    if (p === "/privacy/pause" && m === "POST") {
      if (!["capturing", "paused", "off_record"].includes(body?.state)) return err(400, "bad_request", "state must be capturing, paused or off_record.");
      db.privacy = { state: body.state, since: now() }; emit("privacy.changed", db.privacy);
      return ok(200, db.privacy);
    }
    if (p === "/modes" && m === "GET") return ok(200, { items: db.modes });
    if ((mm = p.match(/^\/modes\/([^/]+)\/activate$/)) && m === "POST") {
      const mode = db.modes.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!mode) return err(404, "not_found", "No such mode.");
      for (const x of db.modes) x.active = x === mode;
      emit("mode.changed", mode);
      return ok(200, mode);
    }

    if (p === "/calls/started" && m === "POST") {
      if (typeof body?.call_id !== "string" || !body.call_id) return err(400, "bad_request", "call_id: required.");
      return ok(200, { ...callStart(body.call_id) });
    }
    if (p === "/calls/ended" && m === "POST") {
      if (typeof body?.call_id !== "string" || !body.call_id) return err(400, "bad_request", "call_id: required.");
      const c = callEnd(body.call_id);
      return c ? ok(200, { ...c }) : err(404, "not_found", "No such call.");
    }
    if (p === "/calls/current" && m === "GET") { const c = callCurrent(); return ok(200, { call: c ? { ...c } : null }); }

    if (p === "/_demo" && m === "GET") return ok(200, demoState());
    if (p === "/_demo/next" && m === "POST") { demoNext(); return ok(200, demoState()); }
    if (p === "/_demo/play" && m === "POST") { demoPlay(); return ok(200, demoState()); }
    if (p === "/_demo/reset" && m === "POST") { reset(); emit("demo.step", demoState()); return ok(200, demoState()); }
    return err(404, "not_found", `No route for ${m} ${p}.`);
  }

  reset();
  return {
    handle,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    stop() { if (playing) { clearInterval(playing); playing = null; } },
  };
}

function localDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
