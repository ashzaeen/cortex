// Contract test for the stateful mock: runs the whole Ash script over HTTP and checks
// every response against contracts/schemas/. Usage: node apps/dashboard/mock/test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startMock } from "./server.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(join(ROOT, "package.json")); // use the repo's tooling deps
const Ajv2020 = require("ajv/dist/2020.js");
const addFormats = require("ajv-formats");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const v = {};
for (const f of readdirSync(join(ROOT, "contracts/schemas"))) {
  const s = JSON.parse(readFileSync(join(ROOT, "contracts/schemas", f), "utf8"));
  v[s.title] = ajv.compile(s);
}

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { failures++; console.error(`  FAIL ${msg}`); } };
const valid = (type, obj, where) => {
  const good = v[type](obj);
  ok(good, `${where}: invalid ${type}: ${ajv.errorsText(v[type].errors)}`);
};

const server = await startMock(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

// Collect SSE events while the script runs.
const events = [];
const ctrl = new AbortController();
fetch(base + "/events", { signal: ctrl.signal }).then(async (r) => {
  const dec = new TextDecoder();
  for await (const chunk of r.body) for (const m of dec.decode(chunk).matchAll(/^event: (.+)$/gm)) events.push(m[1]);
}).catch(() => {});
await new Promise((r) => setTimeout(r, 100));

// Seeded data validates.
for (const [path, type] of [["/moments", "Moment"], ["/people", "Person"], ["/promises", "Promise"], ["/receipts", "Receipt"], ["/modes", "Mode"]]) {
  const { body } = await call("GET", path);
  body.items.forEach((x, i) => valid(type, x, `GET ${path}[${i}]`));
}

// Meet
let r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "glasses", transcript: "This is Ash from Acme." });
ok(r.status === 201, "intro moment returns 201"); valid("Moment", r.body, "POST /moments (intro)");
const ash = (await call("GET", "/people")).body.items.find((p) => p.name === "Ash");
ok(ash && ash.company === "Acme" && ash.introduced_moment_id === r.body.id, "Ash card created with the moment linked (D-3)");
valid("Person", ash, "Ash");

// Promise
r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "glasses", transcript: "I'll send you the deck Friday." });
const prm = (await call("GET", "/promises?status=proposed")).body.items.find((p) => p.person_id === ash.id);
ok(prm && prm.what === "Send the deck" && prm.due.text === "Friday" && prm.due.date, "promise detected with who, what and due date (D-4)");
valid("Promise", prm, "proposed promise");
r = await call("POST", `/promises/${prm.id}/confirm`);
ok(r.body.status === "confirmed", "one-tap confirm");

// Ask with proof
r = await call("POST", "/ask", { question: "What did Ash promise me?", channel: "voice" });
ok(r.body.grounded && /deck/i.test(r.body.spoken) && r.body.sources[0]?.id === prm.source_moment_id, "answer cites the promise moment (D-5)");
r.body.sources.forEach((m, i) => valid("Moment", m, `ask source ${i}`));
r = await call("POST", "/ask", { question: "Where did I leave my keys?", channel: "dashboard" });
ok(r.body.sources[0]?.id === "mom_seed_003", "seeded recall: keys (D-2)");
r = await call("POST", "/ask", { question: "zebra quantum", channel: "dashboard" });
ok(r.body.grounded === false, "no memory means grounded: false");

// Brief
r = await call("GET", `/people/${ash.id}/brief`);
ok(/Acme/.test(r.body.spoken) && r.body.open_promises.length === 1 && r.body.bullets.length === 3, "brief names company and the open promise (D-6)");

// Act
r = await call("POST", "/actions/propose", { type: "follow_up_email", person_id: ash.id });
ok(r.status === 201 && r.body.status === "proposed", "email proposed"); valid("Action", r.body, "proposed action");
const act = r.body;
ok((await call("GET", "/actions?status=proposed")).body.items.some((a) => a.id === act.id), "GET /actions lists it");
r = await call("POST", `/actions/${act.id}/confirm`, { deliver: "send" });
ok(r.body.action.status === "sent" && r.body.receipt.undo.available, "sent with an undo receipt (D-7)");
valid("Action", r.body.action, "sent action"); valid("Receipt", r.body.receipt, "action receipt");
r = await call("POST", `/actions/${act.id}/undo`);
ok(r.body.action.status === "undone", "undo works");

// Phone capture (#4): snapshot plus transcript, same payload the glasses app sends.
const tinyJpeg = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "phone", transcript: "Remember this whiteboard.", snapshot_base64: tinyJpeg });
ok(r.status === 201 && r.body.source === "phone" && r.body.snapshot_url?.startsWith("data:image/jpeg;base64,"), "phone capture stores snapshot and transcript (D-1 fallback)");
valid("Moment", r.body, "phone capture moment");

// Modes (D18): the dock activates a mode; each mode has a working suggestion.
r = await call("POST", "/modes/student/activate");
ok(r.status === 200 && r.body.id === "student" && r.body.active, "activate a mode"); valid("Mode", r.body, "activated mode");
ok((await call("GET", "/modes")).body.items.filter((x) => x.active).map((x) => x.id).join() === "student", "exactly one mode active");
for (const [mode, type] of [["student", "flashcards"], ["life", "reminder"], ["assist", "read_aloud"]]) {
  const items = (await call("GET", `/actions?status=proposed&mode=${mode}`)).body.items;
  ok(items.some((x) => x.type === type && x.title && x.summary), `${mode} has a ${type} suggestion`);
  items.forEach((x) => valid("Action", x, `${mode} suggestion`));
}
const cards = (await call("GET", "/actions?status=proposed&mode=student")).body.items[0];
r = await call("POST", `/actions/${cards.id}/confirm`, { deliver: "do" });
ok(r.body.action.status === "done" && /deck/.test(r.body.receipt.summary) && r.body.receipt.undo.available, "non-email action is done with an undo receipt");
// ACT-5 to ACT-9 in the mock: proposed with their payload, confirmed as a dry run (external: null).
const src = (await call("GET", "/moments?limit=1")).body.items[0].id;
for (const [type, extra, deliver, status] of [
  ["calendar_event", { event: { title: "CSE 3310 demo", start: "2026-11-19T10:00:00-06:00", end: "2026-11-19T11:00:00-06:00", location: null } }, "do", "done"],
  ["notes", { title: "Lecture notes", summary: "Demos moved to Nov 19." }, "do", "done"],
  ["message", { message: { to: "+15555550123", text: "Running 5 minutes late" } }, "send", "draft_saved"],
]) {
  r = await call("POST", "/actions/propose", { type, source_moment_ids: [src], ...extra });
  ok(r.status === 201 && r.body.type === type && r.body.title, `${type} proposed`); valid("Action", r.body, `proposed ${type}`);
  r = await call("POST", `/actions/${r.body.id}/confirm`, { deliver });
  ok(r.body.action.status === status && r.body.action.external === null, `${type} confirmed as a dry run`);
  valid("Action", r.body.action, `confirmed ${type}`); valid("Receipt", r.body.receipt, `${type} receipt`);
}
ok((await call("POST", "/actions/propose", { type: "calendar_event", title: "x", source_moment_ids: [src] })).status === 400, "calendar_event needs an event");
const allActions = (await call("GET", "/actions")).body.items;
ok(allActions.filter((x) => x.type === "follow_up_email").every((x) => x.draft), "every follow_up_email carries a draft");
await call("POST", "/modes/focus/activate");

// Privacy
r = await call("POST", "/privacy/pause", { state: "off_record" });
ok(r.body.state === "off_record", "off the record");
r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "phone", transcript: "secret" });
ok(r.status === 409, "nothing stored while off the record (D-9)");
await call("POST", "/privacy/pause", { state: "capturing" });
r = await call("DELETE", `/moments/${prm.source_moment_id}`);
valid("Receipt", r.body, "deletion receipt");
ok(!(await call("GET", "/moments")).body.items.some((m) => m.id === prm.source_moment_id), "moment deleted (D-9)");
ok(!(await call("GET", "/promises")).body.items.some((p) => p.id === prm.id), "derived promise deleted too");

// Call lifecycle (D-10): the call agent reports a call, the dashboard reads it.
ok((await call("GET", "/calls/current")).body.call === null, "no call in progress at first");
r = await call("POST", "/calls/started", { call_id: "c1" });
ok(r.status === 200 && r.body.call_id === "c1" && r.body.ended_at === null && !Number.isNaN(Date.parse(r.body.started_at)), "call started returns the Call");
ok((await call("POST", "/calls/started", { call_id: "c1" })).body.started_at === r.body.started_at, "starting the same call twice changes nothing");
ok((await call("GET", "/calls/current")).body.call?.call_id === "c1", "current call is the active one");
r = await call("POST", "/calls/started", { call_id: "c2" });
ok((await call("GET", "/calls/current")).body.call?.call_id === "c2", "a new call replaces the active one (one call at a time)");
r = await call("POST", "/calls/ended", { call_id: "c2" });
ok(r.status === 200 && r.body.ended_at, "call ended returns the Call with ended_at");
ok((await call("GET", "/calls/current")).body.call === null, "no active call after it ended");
ok((await call("POST", "/calls/ended", { call_id: "nope" })).status === 404, "ending an unknown call is a 404");
ok((await call("POST", "/calls/started", {})).status === 400, "starting without a call_id is a 400");

// Modes (#50): voice switching, suggestions, enforcement, recap, look, routines, caregiver, custom modes.
await call("POST", "/_demo/reset");
const mp = (transcript, extra = {}) => call("POST", "/moments", { ts: new Date().toISOString(), source: "glasses", transcript, ...extra });
const activeId = async () => (await call("GET", "/modes")).body.items.find((m) => m.active).id;
r = await call("GET", "/modes");
r.body.items.forEach((x, i) => valid("Mode", x, `v2 mode ${i}`));
ok(r.body.suggestion === null, "no mode suggestion at first");
ok((await call("GET", "/modes")).body.items.find((m) => m.id === "assist").retention_days === 7, "assist keeps 7 days");
await mp("Switch to student mode");
ok(await activeId() === "student", "voice switches mode");
await mp("assist mode please");
ok(await activeId() === "assist", "voice switches mode (suffix form)");
await call("POST", "/modes/focus/activate");
ok((await mp("hi", { mode: "Not A Slug!" })).status === 400, "bad mode id on ingest is a 400");
await mp("The professor said the lecture covers the syllabus, the midterm and homework.");
r = await call("GET", "/modes");
ok(r.body.suggestion?.mode_id === "student", "lecture talk suggests Student");
ok((await call("POST", "/modes/suggestion/dismiss")).body.dismissed === true, "dismiss a suggestion");
await mp("The professor said the lecture covers the syllabus, the midterm and homework.");
ok((await call("GET", "/modes")).body.suggestion === null, "a dismissed suggestion stays quiet for a while");
await mp("In the meeting we reviewed the deck, the roadmap and the agenda.");
ok((await call("GET", "/modes")).body.suggestion === null, "Focus talk in Focus never suggests a switch");

r = await call("PATCH", "/modes/student", { allowed_actions: ["notes"] });
ok(r.status === 200 && r.body.allowed_actions.join() === "notes", "edit allowed_actions"); valid("Mode", r.body, "PATCH /modes/student");
ok((await call("PATCH", "/modes/student", { allowed_actions: ["teleport"] })).status === 400, "unknown action type is a 400");
await call("POST", "/modes/student/activate");
const before = (await call("GET", "/actions")).body.items.length;
r = await mp("The midterm is due on Friday.");
ok((await call("GET", "/actions")).body.items.length === before, "allowed_actions filters automatic suggestions");
await call("PATCH", "/modes/student", { allowed_actions: ["flashcards", "notes", "calendar_event"] });
await mp("Reminder: the exam is due on Friday.");
const stu = (await call("GET", "/actions?mode=student")).body.items;
ok(stu.some((a) => a.type === "calendar_event" && /^Due:/.test(a.title)), "Student deadline proposes an event");
stu.forEach((a, i) => valid("Action", a, `student action ${i}`));
await call("POST", "/modes/focus/activate");

r = await mp("Kickoff. We decided to ship the beta on Friday.");
valid("Moment", r.body, "moment with tags"); ok(r.body.tags?.[0] === "decision", "decision moment is tagged");
ok((await call("GET", "/moments?tag=decision")).body.items.some((m) => m.id === r.body.id), "GET /moments?tag=decision");
r = await call("GET", "/recap");
ok(r.status === 200 && r.body.moment_count > 0 && r.body.decisions.length && typeof r.body.spoken === "string", "recap of the latest session");
ok((await call("GET", "/recap?kind=lecture")).body.kind === "lecture", "recap kind=lecture");

r = await call("POST", "/actions/generate", { type: "flashcards", moment_id: r.body.source_moment_ids[0] });
ok(r.status === 201 && r.body.status === "proposed", "generate flashcards proposes an action"); valid("Action", r.body, "generate");
ok((await call("POST", "/actions/generate", { type: "notes", moment_id: "mom_nope" })).status === 404, "generate for an unknown moment is a 404");

await call("POST", "/privacy/pause", { state: "capturing" });
r = await call("POST", "/look", { task: "find", target: "keys" });
ok(r.status === 200 && r.body.task === "find" && typeof r.body.spoken === "string", "look find answers from memory");
ok((await call("POST", "/look", { task: "find" })).status === 400, "look find needs a target");
ok((await call("POST", "/look", { task: "dance" })).status === 400, "look rejects an unknown task");

const hhmm = new Date().toTimeString().slice(0, 5);
r = await call("POST", "/routines", { title: "Take medication", time: hhmm, spoken: "Time for your medication." });
ok(r.status === 201 && r.body.active && r.body.next_at, "create a routine"); valid("Routine", r.body, "POST /routines");
const rid = r.body.id;
ok((await call("POST", "/routines", { title: "x", time: "25:99" })).status === 400, "bad routine time is a 400");
ok((await call("PATCH", `/routines/${rid}`, { active: false })).body.next_at === null, "an inactive routine has no next_at");
await call("PATCH", `/routines/${rid}`, { active: true });
ok((await call("GET", "/routines")).body.items.length === 1, "list routines");
ok((await call("DELETE", `/routines/${rid}`)).body.deleted === rid, "delete a routine");
ok((await call("DELETE", `/routines/${rid}`)).status === 404, "deleting it again is a 404");

ok((await call("POST", "/caregiver/send")).status === 409, "caregiver send needs consent");
ok((await call("PUT", "/caregiver", { consent: true })).status === 400, "consent needs an email");
r = await call("PUT", "/caregiver", { consent: true, name: "Robin", email: "robin@example.com", send_at: "19:30" });
ok(r.body.consent && r.body.send_at === "19:30" && r.body.consented_at && r.body.shares.length, "caregiver consent on");
r = await call("POST", "/caregiver/send");
ok(r.status === 200 && r.body.action.type === "caregiver_summary" && r.body.action.status === "draft_saved", "caregiver send saves a dry-run draft");
valid("Action", r.body.action, "caregiver action"); valid("Receipt", r.body.receipt, "caregiver receipt");
r = await call("POST", `/actions/${r.body.action.id}/undo`);
ok(r.body.action.status === "undone", "caregiver send can be undone");
ok((await call("PUT", "/caregiver", { consent: false })).body.consented_at === null, "caregiver consent revoked");

r = await call("POST", "/modes", { name: "Lab", allowed_actions: ["notes"], retention_days: 14 });
ok(r.status === 201 && r.body.id === "lab" && r.body.custom, "create a custom mode"); valid("Mode", r.body, "POST /modes");
ok((await call("POST", "/modes", { name: "Lab" })).status === 409, "duplicate custom mode is a 409");
await call("POST", "/modes/lab/activate");
ok((await mp("Pipetting now.", { mode: "lab" })).status === 201, "ingest accepts a custom mode id");
ok((await call("DELETE", "/modes/focus")).status === 409, "built-in modes cannot be deleted");
ok((await call("DELETE", "/modes/lab")).body.deleted === "lab" && await activeId() === "focus", "deleting the active custom mode returns to Focus");

r = await call("POST", "/lists/shopping/items", { text: "oat milk" });
ok(r.status === 201, "add a shopping item"); valid("ListItem", r.body, "list item");
await call("POST", "/lists/expenses/items", { text: "lunch", amount: 12.5 });
r = await call("GET", "/lists");
ok(r.body.items.find((l) => l.id === "expenses").total === 12.5 && r.body.items.find((l) => l.id === "shopping").items.length === 1, "lists and expense total");
ok((await call("GET", "/digest")).body.moment_count > 0, "digest of today");
ok((await call("GET", "/rewind?q=decided")).body.found === true, "rewind finds a line");

// Demo driver runs end to end from a reset.
await call("POST", "/_demo/reset");
let d; do { d = (await call("POST", "/_demo/next")).body; } while (d.index < d.total);
const after = await call("GET", "/receipts");
after.body.items.forEach((x, i) => valid("Receipt", x, `receipt after demo ${i}`));
ok(after.body.items.some((x) => /Sent to Ash at Acme/.test(x.summary)), "demo driver completes the Ash script");
(await call("GET", "/moments")).body.items.forEach((x, i) => valid("Moment", x, `moment after demo ${i}`));

await new Promise((r) => setTimeout(r, 100));
for (const t of ["moment.created", "person.created", "promise.proposed", "promise.confirmed", "action.proposed", "action.updated", "receipt.created", "privacy.changed", "moment.deleted", "mode.changed", "call.started", "call.ended"])
  ok(events.includes(t), `event ${t} streamed on /events`);

ctrl.abort();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (failures) { console.error(`mock: ${failures} failed, ${passes} passed`); process.exit(1); }
console.log(`mock: OK (${passes} checks: Ash script, schemas, events)`);
