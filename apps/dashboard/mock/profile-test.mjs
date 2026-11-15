// Tests the demo profile (apps/dashboard/demo/) on the engine the in-browser demo uses:
// schemas, ids, snapshot files, dates shifted onto this week, recall, and the Ash script as a re-meeting.
// Usage: node apps/dashboard/mock/profile-test.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createEngine } from "./engine.mjs";
import { demoEngineOptions, PROFILE_FILES, ASSETS, seedExtras } from "./profile.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const APP = join(ROOT, "apps/dashboard");
const require = createRequire(join(ROOT, "package.json"));
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
const valid = (type, obj, where) => ok(v[type](obj), `${where}: invalid ${type}: ${ajv.errorsText(v[type].errors)}`);

const files = Object.fromEntries(PROFILE_FILES.map((k) => [k, JSON.parse(readFileSync(join(APP, "demo", `${k}.json`), "utf8"))]));
const types = { moments: "Moment", people: "Person", promises: "Promise", actions: "Action", receipts: "Receipt", modes: "Mode" };

// 1. Every entity validates, ids are unique and resolve, every snapshot file exists.
for (const [k, type] of Object.entries(types)) {
  for (const x of files[k]) valid(type, x, `${k}/${x.id}`);
  ok(new Set(files[k].map((x) => x.id)).size === files[k].length, `${k}: ids are unique`);
}
const mids = new Set(files.moments.map((m) => m.id));
const pids = new Set(files.people.map((p) => p.id));
const aids = new Set(files.actions.map((a) => a.id));
for (const m of files.moments) {
  for (const p of m.person_ids) ok(pids.has(p), `${m.id}: person ${p} exists`);
  ok(m.snapshot_url && existsSync(join(APP, "public", m.snapshot_url)), `${m.id}: snapshot ${m.snapshot_url} exists`);
}
for (const s of Object.values(ASSETS)) ok(existsSync(join(APP, "public", s)), `script asset ${s} exists`);
for (const p of files.people) ok(mids.has(p.introduced_moment_id), `${p.id}: introduced_moment_id resolves`);
for (const p of files.promises) { ok(pids.has(p.person_id), `${p.id}: person resolves`); ok(mids.has(p.source_moment_id), `${p.id}: source resolves`); }
for (const a of files.actions) {
  ok(!a.person_id || pids.has(a.person_id), `${a.id}: person resolves`);
  for (const s of a.source_moment_ids) ok(mids.has(s), `${a.id}: source ${s} resolves`);
}
for (const r of files.receipts) {
  ok(!r.action_id || aids.has(r.action_id), `${r.id}: action resolves`);
  for (const s of r.source_moment_ids) ok(mids.has(s), `${r.id}: source ${s} resolves`);
}
for (const mode of ["focus", "student", "life", "assist"]) {
  ok(files.moments.some((m) => m.mode === mode), `profile has ${mode} moments`);
  ok(files.actions.some((a) => a.mode === mode && a.status === "proposed"), `profile has a ${mode} suggestion`);
}
const credits = readFileSync(join(APP, "public/demo-snaps/CREDITS.md"), "utf8");
for (const m of files.moments) if (m.snapshot_url.endsWith(".jpg")) ok(credits.includes(m.snapshot_url.split("/").pop()), `${m.snapshot_url} is credited`);

// 2. The engine shifts the week onto now, and still serves valid data.
const engine = createEngine(demoEngineOptions(files));
const events = [];
engine.subscribe((e) => events.push(e.type));
const call = (method, path, body) => engine.handle(method, path, body);
const moments = call("GET", "/moments?limit=100").body.items;
const newest = Date.parse(moments[0].ts), oldest = Date.parse(moments.at(-1).ts);
ok(newest < Date.now() && newest > Date.now() - 2 * 86_400_000, "newest moment is within the last two days");
ok(oldest > Date.now() - 8 * 86_400_000, "oldest moment is within the last week");
for (const [path, type] of [["/moments?limit=100", "Moment"], ["/people", "Person"], ["/promises", "Promise"], ["/actions", "Action"], ["/receipts", "Receipt"], ["/modes", "Mode"]]) {
  for (const x of call("GET", path).body.items) valid(type, x, `GET ${path}`);
}
const sam = call("GET", "/promises?person_id=per_sam").body.items[0];
const samSaid = moments.find((m) => m.id === sam.source_moment_id);
ok(new Date(`${sam.due.date}T12:00:00`).getDay() === 5 && sam.due.date > samSaid.ts.slice(0, 10), "Sam's 'by Friday' is the Friday after the career fair");

// 3. Recall: each question answers from the right moment.
const recall = {
  "Where did I leave my keys?": "mom_demo_14",
  "Where did I park?": "mom_demo_03",
  "When are the CSE 3310 demos?": "mom_demo_20",
  "Where is my charger?": "mom_demo_30",
  "When are my library books due?": "mom_demo_19",
  "When is judging?": "mom_demo_25",
  "What did Sam promise me?": "mom_demo_11",
  "What do I owe Dana?": "mom_demo_16",
  "What do I owe Jamie?": "mom_demo_05",
  "What does Exam 2 cover?": "mom_demo_21",
};
for (const [q, want] of Object.entries(recall)) {
  const a = call("POST", "/ask", { question: q, channel: "dashboard" }).body;
  ok(a.grounded && a.sources[0]?.id === want, `"${q}" -> ${want} (got ${a.sources[0]?.id})`);
}
const before = call("GET", "/people/per_ash/brief").body;
ok(/career fair/i.test(before.spoken), "brief on Ash before the demo mentions the career fair");

// 4. The Ash script runs as a re-meeting: no duplicate card, the live moment links to per_ash.
const peopleBefore = call("GET", "/people").body.items.length;
let state = call("GET", "/_demo").body;
while (state.index < state.total) state = call("POST", "/_demo/next").body;
const people = call("GET", "/people").body.items;
ok(people.length === peopleBefore && people.filter((p) => p.name === "Ash").length === 1, "Ash is not duplicated");
const live = call("GET", "/moments?limit=100").body.items.find((m) => m.transcript === "This is Ash from Acme.");
ok(live?.person_ids.includes("per_ash"), "live intro links to the seeded Ash");
ok(events.includes("person.updated") && !events.includes("person.created"), "re-meeting emits person.updated, not person.created");
const ashPromise = call("GET", "/promises?person_id=per_ash").body.items[0];
ok(ashPromise?.status === "confirmed" && /deck/i.test(ashPromise.what), "Ash's deck promise is tracked");
ok(call("GET", "/actions").body.items.some((a) => a.person_id === "per_ash" && a.status === "sent" && a.draft.body.endsWith(files.owner.name.split(" ")[0])), "email to Ash is sent and signed by the persona");
const after = call("GET", "/people/per_ash/brief").body;
ok(/career fair/i.test(after.spoken) && /deck/i.test(after.spoken), "brief after the demo has the first meeting and the open deck");
const finale = call("POST", "/ask", { question: "What is open with Ash?", channel: "call" }).body;
ok(finale.grounded && /deck/i.test(finale.answer), "finale answers the open deck from memory");

// 5. Reset gives a fresh copy.
call("POST", "/_demo/reset");
ok(call("GET", "/moments?limit=100").body.items.length === files.moments.length, "reset restores the profile");
engine.stop();

// 6. The extras (extras.json) give routines, the caregiver, lists, immersion words and a coach session something to show,
// and the moments tagged decision feed the Decisions view and the meeting recap.
const rich = createEngine(demoEngineOptions(files));
seedExtras(rich, files.extras);
const get = (path) => rich.handle("GET", path).body;
ok(get("/routines").items.length === files.extras.routines.length, "routines are seeded");
const cg = get("/caregiver");
ok(cg.consent === false && cg.name === files.extras.caregiver.name && /Routine:/.test(cg.preview.body), "caregiver is set up, never consented, and previews");
ok(get("/lists").items.find((l) => l.id === "shopping").items.length >= 4, "the shopping list has items");
ok(get("/lists").items.find((l) => l.id === "expenses").total === 18.4, "the expenses list has the lunch");
ok(get("/skills/immersion/vocab").items.length === files.extras.vocab.length, "immersion words are seeded");
ok(get("/skills/coach").items.some((c) => c.status === "done"), "a finished coach session is seeded");
ok(get("/moments?tag=decision&limit=50").items.length >= 2, "decision-tagged moments exist");
ok(get("/promises").items.some((x) => x.status === "confirmed" && x.due.date && x.due.date < new Date().toISOString().slice(0, 10)), "an overdue promise exists for the nudges");
ok(get("/actions").items.some((a) => a.type === "calendar_event" && a.status === "done"), "an approved calendar event exists for the auto brief");
rich.stop();

if (failures) { console.error(`profile: ${failures} failed, ${passes} passed`); process.exit(1); }
console.log(`profile: OK (${passes} checks: schemas, ids, snapshots, dates, recall, Ash re-meeting)`);
