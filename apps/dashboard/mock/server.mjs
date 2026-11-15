// Stateful mock of the Cortex API (contracts/openapi.yaml) with an Ash demo driver.
// Dev-only and throwaway: it fakes the backend's behaviour with simple rules so the
// dashboard can be built and rehearsed before the backend exists. Node stdlib only.
//
//   node apps/dashboard/mock/server.mjs [--port 4010]
//
// Mock-only extras (not in the contract): GET /_demo, POST /_demo/next, /_demo/play,
// /_demo/reset, a `demo.step` event on /events, and static files under /fixtures/.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const UNDO_WINDOW_MS = 60_000;
const STOP = new Set("a an the and or of to in on at for with me my i you your what did is are was were who whom about from by this that it do does any open".split(" "));

// ---------------------------------------------------------------- state
let db;
function freshState() {
  const load = (f) => JSON.parse(readFileSync(join(ROOT, "fixtures", f), "utf8"));
  return {
    moments: load("moments.json"),
    people: load("people.json"),
    promises: load("promises.json"),
    actions: load("actions.json"),
    receipts: load("receipts.json"),
    modes: load("modes.json"),
    privacy: { state: "capturing", since: now() },
    demoIndex: 0,
  };
}
// Mode suggestions (design decision D18): each mode suggests its own action. Mock-only rules for now;
// the real backend replaces them. Seeded at start so every mode has something to approve.
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
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
const activeMode = () => db.modes.find((m) => m.active)?.id ?? "focus";

// ---------------------------------------------------------------- events (SSE)
const clients = new Set();
function emit(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify({ type, at: now(), data })}\n\n`;
  for (const res of clients) res.write(msg);
}

// ---------------------------------------------------------------- skills (fake rules)
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function dueFrom(text, fromIso) {
  const m = text.toLowerCase().match(/\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (!m) return { date: null, inferred: false, text: null };
  const d = new Date(fromIso);
  if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
  else if (m[1] !== "today") {
    const target = DAYS.indexOf(m[1]);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
  }
  return { date: d.toISOString().slice(0, 10), inferred: false, text: m[0][0].toUpperCase() + m[0].slice(1) };
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
    if (!person) {
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
  }
  // Otherwise link to the most recently introduced person in the last 10 minutes.
  if (!person) {
    const recent = [...db.moments].reverse().find((m) => m !== moment && m.person_ids.length && Date.parse(moment.ts) - Date.parse(m.ts) < 600_000);
    if (recent) person = db.people.find((p) => p.id === recent.person_ids[0]);
  }
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

const words = (s) => (s ?? "").toLowerCase().match(/[a-z0-9']+/g)?.filter((w) => !STOP.has(w) && w.length > 1) ?? [];
function search(q, limit = 5) {
  const qw = new Set(words(q));
  return db.moments
    .map((m) => {
      const names = m.person_ids.map((pid) => db.people.find((p) => p.id === pid)?.name ?? "").join(" ");
      const hay = words(`${m.transcript} ${m.caption} ${m.place} ${names}`);
      const score = hay.filter((w) => qw.has(w)).length / Math.max(qw.size, 1);
      return { moment: m, score: Math.round(score * 100) / 100 };
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
      const list = open.map((p) => `${p.direction === "waiting_on" ? `${person.name} owes you` : `You owe ${person.name}`}: ${p.what.toLowerCase()}, due ${fmtDue(p.due)}`);
      const sources = open.map((p) => db.moments.find((m) => m.id === p.source_moment_id)).filter(Boolean);
      const spoken = open.length === 1 && open[0].direction === "waiting_on"
        ? `${person.name} promised to ${open[0].what.toLowerCase()} by ${open[0].due.text ?? "no set date"}.`
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
  const first = moments[0];
  const met = first ? new Date(first.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "unknown";
  if (!moments.length) return { person, spoken: `I have nothing on file about ${person.name}.`, bullets: [], open_promises: [], sources: [] };
  const last = moments.at(-1);
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
  const first = person.name.split(" ")[0];
  const a = {
    id: id("act"), type: "follow_up_email", status: "proposed", mode: "focus", person_id: personId,
    title: `Draft a follow-up to ${first}`,
    summary: `Thanks for the intro today.${open.length ? ` You mentioned you would ${open[0].what.toLowerCase()} by ${open[0].due.text ?? "soon"}, and Cortex will watch for it.` : ""} Could we find 20 minutes next week?`,
    draft: {
      to: `${first.toLowerCase()}@${(person.company ?? "example").toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
      subject: `Great meeting you${person.company ? `, from ${person.company}` : ""}`,
      body: `Hi ${first},\n\nGreat to meet you today.${open.length ? ` Looking forward to ${open[0].what.replace(/^Send /i, "").toLowerCase()} by ${open[0].due.text ?? "soon"}.` : ""}\n\nBest,\nCortex user`,
    },
    source_moment_ids: srcs.length ? srcs : [db.moments.at(-1).id],
  };
  db.actions.push(a);
  emit("action.proposed", a);
  return a;
}

// ---------------------------------------------------------------- demo driver (the Ash script)
const ashPerson = () => db.people.find((p) => p.name === "Ash");
const DEMO = [
  { beat: "Meet", label: 'Glasses hear "This is Ash from Acme."', you: "Watch the contact card appear.",
    run: () => ingest({ ts: now(), source: "glasses", transcript: "This is Ash from Acme.", snapshot_url: "fixtures/snapshots/placeholder-booth.svg", place: "HackUTA expo hall" }) },
  { beat: "Promise", label: `Ash says "I'll send you the deck Friday."`, you: "Tap Confirm on the promise chip.",
    run: () => ingest({ ts: now(), source: "glasses", transcript: "I'll send you the deck Friday.", snapshot_url: "fixtures/snapshots/placeholder-booth.svg", place: "HackUTA expo hall" }) },
  { beat: "Promise", label: "Confirm the promise chip", you: "(The driver taps Confirm if you have not.)",
    run: () => { const p = db.promises.find((x) => x.status === "proposed" && x.person_id === ashPerson()?.id); if (p) confirmPromise(p); } },
  { beat: "Ask", label: 'Ask "What did Ash promise me?"', you: "Ask it on the Ask tab.",
    run: () => ask("What did Ash promise me?") },
  { beat: "Brief", label: 'Ask "Brief me on Ash."', you: "Tap Brief on Ash's card.",
    run: () => { const p = ashPerson(); if (p) brief(p); } },
  { beat: "Act", label: "Cortex proposes a follow-up email", you: "Approve it on the Live tab, then try Undo.",
    run: () => { const p = ashPerson(); if (p && !db.actions.some((a) => a.type === "follow_up_email" && a.person_id === p.id && a.status === "proposed")) proposeEmail(p.id); } },
  { beat: "Act", label: "Approve and send the email", you: "(The driver approves it if you have not.)",
    run: () => { const a = db.actions.find((x) => x.type === "follow_up_email" && x.status === "proposed" && x.person_id === ashPerson()?.id); if (a) confirmAction(a, "send"); } },
  { beat: "Call", label: "FaceTime caller shows a business card", you: "Watch the call moment arrive.",
    run: () => { emit("call.started", { call_id: "call_demo" }); ingest({ ts: now(), source: "call", call_id: "call_demo", transcript: "Here's Ash's business card.", caption: "Business card: Ash, Acme, ash@acme.example", snapshot_url: "fixtures/snapshots/placeholder-booth.svg" }); } },
  { beat: "Call", label: 'Caller asks "What is open with Ash?"', you: "Hear the answer from memory.",
    run: () => { ask("What is open with Ash?"); emit("call.ended", { call_id: "call_demo" }); } },
];
const demoState = () => ({ index: db.demoIndex, total: DEMO.length, steps: DEMO.map(({ beat, label, you }, i) => ({ i, beat, label, you, done: i < db.demoIndex })) });
function demoNext() {
  if (db.demoIndex >= DEMO.length) return false;
  DEMO[db.demoIndex].run();
  db.demoIndex++;
  emit("demo.step", demoState());
  return true;
}
let playing = null;
function demoPlay(ms = 2500) {
  if (playing) return;
  playing = setInterval(() => { if (!demoNext()) { clearInterval(playing); playing = null; } }, ms);
  demoNext();
}

// ---------------------------------------------------------------- actions
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
function confirmAction(a, deliver) {
  const person = db.people.find((p) => p.id === a.person_id);
  let summary;
  if (a.type === "follow_up_email") {
    a.status = deliver === "draft" ? "draft_saved" : "sent";
    summary = `${deliver === "draft" ? "Saved a draft to" : "Sent to"} ${person?.name ?? "contact"}${person?.company ? ` at ${person.company}` : ""}`;
  } else {
    a.status = "done";
    summary = { flashcards: "Cards added to your deck", reminder: "Reminder set", read_aloud: "Reading aloud now" }[a.type];
  }
  emit("action.updated", a);
  const r = receipt("action", summary, a.source_moment_ids, a.id, true);
  return { action: a, receipt: r };
}

// ---------------------------------------------------------------- http
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const err = (res, status, code, message) => send(res, status, { error: { code, message } });
const readBody = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch { ok(null); } }); });
const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };

async function route(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;
  if (m === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,DELETE", "access-control-allow-headers": "content-type" }); return res.end(); }
  let mm;

  if (m === "GET" && p === "/health") return send(res, 200, { ok: true });
  if (m === "GET" && p === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "access-control-allow-origin": "*" });
    res.write(": connected\n\n");
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (m === "GET" && p.startsWith("/fixtures/")) {
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(join(ROOT, "fixtures"))) || !existsSync(file)) return err(res, 404, "not_found", "No such file.");
    return send(res, 200, readFileSync(file), MIME[extname(file)] ?? "application/octet-stream");
  }

  if (p === "/moments" && m === "POST") {
    const out = ingest(await readBody(req));
    return out.error ? err(res, ...out.error) : send(res, 201, out.moment);
  }
  if (p === "/moments" && m === "GET") {
    const since = url.searchParams.get("since"); const limit = Number(url.searchParams.get("limit") ?? 50);
    const items = db.moments.filter((x) => !since || x.ts > since).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
    return send(res, 200, { items });
  }
  if (p === "/moments/search" && m === "GET") {
    const q = url.searchParams.get("q");
    if (!q) return err(res, 400, "bad_request", "q is required.");
    return send(res, 200, { results: search(q, Number(url.searchParams.get("limit") ?? 5)) });
  }
  if ((mm = p.match(/^\/moments\/([^/]+)$/)) && m === "DELETE") {
    const i = db.moments.findIndex((x) => x.id === mm[1]);
    if (i < 0) return err(res, 404, "not_found", "No such moment.");
    const [gone] = db.moments.splice(i, 1);
    const droppedPromises = db.promises.filter((x) => x.source_moment_id === gone.id).length;
    db.promises = db.promises.filter((x) => x.source_moment_id !== gone.id);
    for (const r of db.receipts) r.source_moment_ids = r.source_moment_ids.filter((x) => x !== gone.id);
    for (const a of db.actions) a.source_moment_ids = a.source_moment_ids.filter((x) => x !== gone.id);
    emit("moment.deleted", { id: gone.id });
    return send(res, 200, receipt("deletion", `Deleted 1 moment and its transcript, snapshot${droppedPromises ? ` and ${droppedPromises} promise(s)` : ""}.`, []));
  }
  if (p === "/ask" && m === "POST") {
    const b = await readBody(req);
    if (!b?.question || !b?.channel) return err(res, 400, "bad_request", "question and channel are required.");
    return send(res, 200, ask(b.question));
  }
  if (p === "/people" && m === "GET") return send(res, 200, { items: db.people });
  if (p === "/people" && m === "POST") {
    const b = await readBody(req);
    if (!b?.name || !b?.introduced_moment_id) return err(res, 400, "bad_request", "name and introduced_moment_id are required.");
    const person = { id: id("per"), name: b.name, company: b.company ?? null, role: null, consent: "introduction", introduced_moment_id: b.introduced_moment_id, topics: [], notes: null, name_confidence: 1 };
    db.people.push(person); emit("person.created", person);
    return send(res, 201, person);
  }
  if ((mm = p.match(/^\/people\/([^/]+)\/brief$/)) && m === "GET") {
    const person = db.people.find((x) => x.id === mm[1]);
    return person ? send(res, 200, brief(person)) : err(res, 404, "not_found", "No such person.");
  }
  if (p === "/promises" && m === "GET") {
    const f = Object.fromEntries(["status", "direction", "person_id"].map((k) => [k, url.searchParams.get(k)]));
    return send(res, 200, { items: db.promises.filter((x) => Object.entries(f).every(([k, v]) => !v || x[k] === v)) });
  }
  if (p === "/promises" && m === "POST") {
    const b = await readBody(req);
    if (!b?.direction || !b?.person_id || !b?.what || !b?.source_moment_id) return err(res, 400, "bad_request", "direction, person_id, what and source_moment_id are required.");
    const src = db.moments.find((x) => x.id === b.source_moment_id);
    const pr = { id: id("prm"), direction: b.direction, person_id: b.person_id, what: b.what, due: b.due_text ? dueFrom(b.due_text, src?.ts ?? now()) : { date: null, inferred: false, text: null }, status: "proposed", source_moment_id: b.source_moment_id };
    db.promises.push(pr); emit("promise.proposed", pr);
    return send(res, 201, pr);
  }
  if ((mm = p.match(/^\/promises\/([^/]+)\/confirm$/)) && m === "POST") {
    const pr = db.promises.find((x) => x.id === mm[1]);
    return pr ? send(res, 200, confirmPromise(pr)) : err(res, 404, "not_found", "No such promise.");
  }
  if (p === "/actions" && m === "GET") {
    const status = url.searchParams.get("status"); const mode = url.searchParams.get("mode");
    return send(res, 200, { items: db.actions.filter((a) => (!status || a.status === status) && (!mode || a.mode === mode)) });
  }
  if (p === "/actions/propose" && m === "POST") {
    const b = await readBody(req);
    const a = b?.person_id && proposeEmail(b.person_id, b.source_moment_ids);
    return a ? send(res, 201, a) : err(res, 400, "bad_request", "A known person_id is required.");
  }
  if ((mm = p.match(/^\/actions\/([^/]+)\/confirm$/)) && m === "POST") {
    const a = db.actions.find((x) => x.id === mm[1]); const b = await readBody(req);
    if (!a) return err(res, 404, "not_found", "No such action.");
    if (a.status !== "proposed") return err(res, 409, "not_proposed", `Action is already ${a.status}.`);
    if (b?.draft) a.draft = { ...a.draft, ...b.draft };
    return send(res, 200, confirmAction(a, b?.deliver === "draft" ? "draft" : "send"));
  }
  if ((mm = p.match(/^\/actions\/([^/]+)\/undo$/)) && m === "POST") {
    const a = db.actions.find((x) => x.id === mm[1]);
    if (!a) return err(res, 404, "not_found", "No such action.");
    const orig = [...db.receipts].reverse().find((r) => r.action_id === a.id && r.undo.available);
    if (!orig || Date.parse(orig.undo.until) < Date.now()) return err(res, 409, "undo_expired", "The undo window has closed.");
    orig.undo = { available: false, until: orig.undo.until };
    a.status = "undone"; emit("action.updated", a);
    return send(res, 200, { action: a, receipt: receipt("action", `Undid: ${orig.summary}`, a.source_moment_ids, a.id) });
  }
  if (p === "/receipts" && m === "GET") return send(res, 200, { items: [...db.receipts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) });
  if (p === "/privacy" && m === "GET") return send(res, 200, db.privacy);
  if (p === "/privacy/pause" && m === "POST") {
    const b = await readBody(req);
    if (!["capturing", "paused", "off_record"].includes(b?.state)) return err(res, 400, "bad_request", "state must be capturing, paused or off_record.");
    db.privacy = { state: b.state, since: now() }; emit("privacy.changed", db.privacy);
    return send(res, 200, db.privacy);
  }
  if (p === "/modes" && m === "GET") return send(res, 200, { items: db.modes });
  if ((mm = p.match(/^\/modes\/([^/]+)\/activate$/)) && m === "POST") {
    const mode = db.modes.find((x) => x.id === mm[1]);
    if (!mode) return err(res, 404, "not_found", "No such mode.");
    for (const x of db.modes) x.active = x === mode;
    emit("mode.changed", mode);
    return send(res, 200, mode);
  }

  if (p === "/_demo" && m === "GET") return send(res, 200, demoState());
  if (p === "/_demo/next" && m === "POST") { demoNext(); return send(res, 200, demoState()); }
  if (p === "/_demo/play" && m === "POST") { demoPlay(); return send(res, 200, demoState()); }
  if (p === "/_demo/reset" && m === "POST") {
    if (playing) { clearInterval(playing); playing = null; }
    db = freshState(); seedModeSuggestions(); emit("demo.step", demoState());
    return send(res, 200, demoState());
  }
  return err(res, 404, "not_found", `No route for ${m} ${p}.`);
}

export function startMock(port = 4010, host = "127.0.0.1") {
  db = freshState();
  seedModeSuggestions();
  const server = createServer((req, res) => route(req, res).catch((e) => { console.error(e); err(res, 500, "mock_error", String(e?.message ?? e)); }));
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : Number(process.env.PORT ?? 4010);
  startMock(port).then(() => console.log(`[mock] stateful Cortex mock at http://127.0.0.1:${port}  (demo driver: POST /_demo/next)`));
}
