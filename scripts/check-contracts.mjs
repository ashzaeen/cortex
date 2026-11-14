// Contract tests: schemas compile, fixtures and openapi examples validate, ids resolve.
// Usage: node scripts/check-contracts.mjs
import { readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { read, root } from "./lib.mjs";

const errors = [];
const fail = (msg) => errors.push(msg);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

// 1. Every schema compiles.
const schemaDir = "contracts/schemas";
const validators = {};
for (const file of readdirSync(join(root, schemaDir)).filter((f) => f.endsWith(".schema.json"))) {
  const schema = JSON.parse(read(`${schemaDir}/${file}`));
  try {
    validators[schema.title] = ajv.compile(schema);
  } catch (e) {
    fail(`${file}: does not compile: ${e.message}`);
  }
}
const required = ["Moment", "Person", "Promise", "Action", "Receipt", "Mode"];
for (const t of required) if (!validators[t]) fail(`missing schema for ${t}`);

const check = (type, obj, where) => {
  const v = validators[type];
  if (v && !v(obj)) fail(`${where}: invalid ${type}: ${ajv.errorsText(v.errors)}`);
};

// 2. Fixtures validate.
const fixtures = {
  Moment: "fixtures/moments.json",
  Person: "fixtures/people.json",
  Promise: "fixtures/promises.json",
  Action: "fixtures/actions.json",
  Receipt: "fixtures/receipts.json",
  Mode: "fixtures/modes.json",
};
const data = {};
for (const [type, path] of Object.entries(fixtures)) {
  data[type] = JSON.parse(read(path));
  if (!Array.isArray(data[type])) fail(`${path}: must be a JSON array`);
  else data[type].forEach((o, i) => check(type, o, `${path}[${i}] ${o.id ?? ""}`));
}

// 3. Shared openapi examples validate (x-examples, reused via YAML aliases).
const spec = parse(read("contracts/openapi.yaml"), { maxAliasCount: -1 });
const exampleTypes = {
  AshIntroMoment: "Moment",
  AshPromiseMoment: "Moment",
  Ash: "Person",
  AshPromise: "Promise",
  FollowUp: "Action",
  FollowUpReceipt: "Receipt",
};
for (const [name, type] of Object.entries(exampleTypes)) {
  const ex = spec["x-examples"]?.[name];
  if (!ex) fail(`openapi.yaml: x-examples.${name} missing`);
  else check(type, ex, `openapi.yaml x-examples.${name}`);
}

// 4. Cross-references in fixtures resolve.
const ids = (type) => new Set((data[type] ?? []).map((o) => o.id));
const moments = ids("Moment"), people = ids("Person"), actions = ids("Action");
const ref = (set, id, where) => { if (id != null && !set.has(id)) fail(`${where}: unknown id ${id}`); };
for (const t of required) {
  const seen = new Set();
  for (const o of data[t] ?? []) {
    if (seen.has(o.id)) fail(`${fixtures[t]}: duplicate id ${o.id}`);
    seen.add(o.id);
  }
}
for (const m of data.Moment ?? []) m.person_ids.forEach((p) => ref(people, p, `moment ${m.id}`));
for (const p of data.Person ?? []) ref(moments, p.introduced_moment_id, `person ${p.id}`);
for (const p of data.Promise ?? []) { ref(people, p.person_id, `promise ${p.id}`); ref(moments, p.source_moment_id, `promise ${p.id}`); }
for (const a of data.Action ?? []) { ref(people, a.person_id, `action ${a.id}`); a.source_moment_ids.forEach((m) => ref(moments, m, `action ${a.id}`)); }
for (const r of data.Receipt ?? []) { ref(actions, r.action_id, `receipt ${r.id}`); r.source_moment_ids.forEach((m) => ref(moments, m, `receipt ${r.id}`)); }
if ((data.Mode ?? []).filter((m) => m.active).length !== 1) fail("fixtures/modes.json: exactly one mode must be active");

// 5. Required endpoints exist.
const endpoints = [
  ["post", "/moments"], ["get", "/moments/search"], ["delete", "/moments/{id}"], ["post", "/ask"],
  ["get", "/people"], ["get", "/people/{id}/brief"], ["post", "/promises"], ["post", "/promises/{id}/confirm"],
  ["get", "/promises"], ["post", "/actions/propose"], ["post", "/actions/{id}/confirm"], ["post", "/actions/{id}/undo"],
  ["get", "/receipts"], ["post", "/privacy/pause"], ["get", "/events"], ["get", "/actions"],
];
for (const [method, path] of endpoints) if (!spec.paths?.[path]?.[method]) fail(`openapi.yaml: missing ${method.toUpperCase()} ${path}`);

if (errors.length) {
  console.error(`contracts: ${errors.length} problem(s)\n - ` + errors.join("\n - "));
  process.exit(1);
}
const counts = Object.entries(data).map(([t, a]) => `${a.length} ${t}`).join(", ");
console.log(`contracts: OK (${Object.keys(validators).length} schemas, ${endpoints.length} endpoints, fixtures: ${counts})`);
