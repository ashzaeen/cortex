// Smoke test for the skills in the stateful mock. Usage: node apps/dashboard/mock/skills-test.mjs
import { startMock } from "./server.mjs";

const server = await startMock(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("  FAIL " + m); } };

ok((await call("GET", "/skills")).body.items.length === 8, "eight skills");
const noGlasses = await call("POST", "/skills/world", { source: "glasses" });
ok(noGlasses.status === 409 && noGlasses.body.error.code === "no_glasses", "no glasses is 409");
await call("POST", "/_demo/glasses", { on: true });
ok((await call("GET", "/skills/view")).body.available, "glasses on");
ok((await call("POST", "/skills/world", { source: "glasses" })).body.spoken.includes("mug"), "world on glasses");
ok((await call("POST", "/skills/translate", { text: "Hello", target_language: "French" })).body.translation === "bonjour", "translate");
const named = await call("POST", "/skills/immersion/name", { snapshot_base64: "cup table window" });
ok(named.body.items?.length === 3, "immersion names three");
const q = (await call("GET", "/skills/immersion/quiz")).body;
ok(q.choices.length === 3, "quiz choices");
await call("PUT", "/skills/proactive/settings", { enabled: true, dwell_seconds: 0 });
ok((await call("POST", "/skills/proactive/observe", { snapshot_base64: "confusing" })).body.offered, "proactive offers");
const c = (await call("POST", "/skills/coach", { goal: "fix a tap" })).body;
ok(c.session.steps.length === 4, "coach plan");
for (let i = 0; i < 4; i++) var last = (await call("POST", `/skills/coach/${c.session.id}/step`, { said: "next" })).body;
ok(last.session.status === "done", "coach done");
ok((await call("GET", "/skills/people/search?q=Acme")).status === 200, "people search");
ok((await call("GET", "/skills/nudges/settings")).body.daily_cap === 3, "nudge defaults");
server.close();
console.log(fails ? `skills mock: ${fails} failed` : "skills mock: OK");
process.exit(fails ? 1 : 0);
