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
ok(ash && ash.company === "Acme" && ash.introduced_moment_id === r.body.id, "Ash card created with the moment linked (T0-3)");
valid("Person", ash, "Ash");

// Promise
r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "glasses", transcript: "I'll send you the deck Friday." });
const prm = (await call("GET", "/promises?status=proposed")).body.items.find((p) => p.person_id === ash.id);
ok(prm && prm.what === "Send the deck" && prm.due.text === "Friday" && prm.due.date, "promise detected with who, what and due date (T0-4)");
valid("Promise", prm, "proposed promise");
r = await call("POST", `/promises/${prm.id}/confirm`);
ok(r.body.status === "confirmed", "one-tap confirm");

// Ask with proof
r = await call("POST", "/ask", { question: "What did Ash promise me?", channel: "voice" });
ok(r.body.grounded && /deck/i.test(r.body.spoken) && r.body.sources[0]?.id === prm.source_moment_id, "answer cites the promise moment (T0-5)");
r.body.sources.forEach((m, i) => valid("Moment", m, `ask source ${i}`));
r = await call("POST", "/ask", { question: "Where did I leave my keys?", channel: "dashboard" });
ok(r.body.sources[0]?.id === "mom_seed_003", "seeded recall: keys (T0-2)");
r = await call("POST", "/ask", { question: "zebra quantum", channel: "dashboard" });
ok(r.body.grounded === false, "no memory means grounded: false");

// Brief
r = await call("GET", `/people/${ash.id}/brief`);
ok(/Acme/.test(r.body.spoken) && r.body.open_promises.length === 1 && r.body.bullets.length === 3, "brief names company and the open promise (T0-6)");

// Act
r = await call("POST", "/actions/propose", { type: "follow_up_email", person_id: ash.id });
ok(r.status === 201 && r.body.status === "proposed", "email proposed"); valid("Action", r.body, "proposed action");
const act = r.body;
ok((await call("GET", "/actions?status=proposed")).body.items.some((a) => a.id === act.id), "GET /actions lists it");
r = await call("POST", `/actions/${act.id}/confirm`, { deliver: "send" });
ok(r.body.action.status === "sent" && r.body.receipt.undo.available, "sent with an undo receipt (T0-7)");
valid("Action", r.body.action, "sent action"); valid("Receipt", r.body.receipt, "action receipt");
r = await call("POST", `/actions/${act.id}/undo`);
ok(r.body.action.status === "undone", "undo works");

// Phone capture (#4): snapshot plus transcript, same payload the glasses app sends.
const tinyJpeg = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "phone", transcript: "Remember this whiteboard.", snapshot_base64: tinyJpeg });
ok(r.status === 201 && r.body.source === "phone" && r.body.snapshot_url?.startsWith("data:image/jpeg;base64,"), "phone capture stores snapshot and transcript (T0-1 fallback)");
valid("Moment", r.body, "phone capture moment");

// Privacy
r = await call("POST", "/privacy/pause", { state: "off_record" });
ok(r.body.state === "off_record", "off the record");
r = await call("POST", "/moments", { ts: new Date().toISOString(), source: "phone", transcript: "secret" });
ok(r.status === 409, "nothing stored while off the record (T0-9)");
await call("POST", "/privacy/pause", { state: "capturing" });
r = await call("DELETE", `/moments/${prm.source_moment_id}`);
valid("Receipt", r.body, "deletion receipt");
ok(!(await call("GET", "/moments")).body.items.some((m) => m.id === prm.source_moment_id), "moment deleted (T0-9)");
ok(!(await call("GET", "/promises")).body.items.some((p) => p.id === prm.id), "derived promise deleted too");

// Demo driver runs end to end from a reset.
await call("POST", "/_demo/reset");
let d; do { d = (await call("POST", "/_demo/next")).body; } while (d.index < d.total);
const after = await call("GET", "/receipts");
after.body.items.forEach((x, i) => valid("Receipt", x, `receipt after demo ${i}`));
ok(after.body.items.some((x) => /Sent follow-up email to Ash/.test(x.summary)), "demo driver completes the Ash script");
(await call("GET", "/moments")).body.items.forEach((x, i) => valid("Moment", x, `moment after demo ${i}`));

await new Promise((r) => setTimeout(r, 100));
for (const t of ["moment.created", "person.created", "promise.proposed", "promise.confirmed", "action.proposed", "action.updated", "receipt.created", "privacy.changed", "moment.deleted"])
  ok(events.includes(t), `event ${t} streamed on /events`);

ctrl.abort();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (failures) { console.error(`mock: ${failures} failed, ${passes} passed`); process.exit(1); }
console.log(`mock: OK (${passes} checks: Ash script, schemas, events)`);
