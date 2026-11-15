// Stateful mock of the Cortex API (contracts/openapi.yaml) over HTTP, with an Ash demo driver.
// Dev-only and throwaway: the behaviour lives in ./engine.mjs (shared with the in-browser demo at
// /demo); this file adds HTTP, Server-Sent Events and static files. Node stdlib only.
//
//   node apps/dashboard/mock/server.mjs [--port 4010] [--profile demo]
//
// Default data: fixtures/ (the same seed the backend loads). --profile demo serves the full demo
// profile from apps/dashboard/demo/ instead, dated to this week.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./engine.mjs";
import { demoEngineOptions, PROFILE_FILES } from "./profile.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (dir, f) => JSON.parse(readFileSync(join(ROOT, dir, f), "utf8"));

function fixturesEngine() {
  const load = () => Object.fromEntries(["moments", "people", "promises", "actions", "receipts", "modes"].map((k) => [k, read("fixtures", `${k}.json`)]));
  return createEngine({ load, suggestions: true });
}

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((ok) => {
  let s = "";
  req.on("data", (c) => (s += c));
  req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch { ok(null); } });
});
const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };

export function startMock(port = 4010, host = "127.0.0.1", { profile = "fixtures" } = {}) {
  const engine = profile === "demo"
    ? createEngine(demoEngineOptions(Object.fromEntries(PROFILE_FILES.map((k) => [k, read("apps/dashboard/demo", `${k}.json`)]))))
    : fixturesEngine();
  const clients = new Set();
  engine.subscribe((msg) => {
    const line = `event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`;
    for (const res of clients) res.write(line);
  });

  async function route(req, res) {
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE", "access-control-allow-headers": "content-type" });
      return res.end();
    }
    if (req.method === "GET" && p === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "access-control-allow-origin": "*" });
      res.write(": connected\n\n");
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === "GET" && p.startsWith("/fixtures/")) {
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(normalize(join(ROOT, "fixtures"))) || !existsSync(file)) return send(res, 404, { error: { code: "not_found", message: "No such file." } });
      return send(res, 200, readFileSync(file), MIME[extname(file)] ?? "application/octet-stream");
    }
    const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : null;
    const out = engine.handle(req.method, url.pathname + url.search, body);
    return send(res, out.status, out.body);
  }

  const server = createServer((req, res) => route(req, res).catch((e) => {
    console.error(e);
    send(res, 500, { error: { code: "mock_error", message: String(e?.message ?? e) } });
  }));
  server.on("close", () => engine.stop());
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const port = Number(arg("--port") ?? process.env.PORT ?? 4010);
  const profile = arg("--profile") ?? process.env.MOCK_PROFILE ?? "fixtures";
  startMock(port, "127.0.0.1", { profile }).then(() =>
    console.log(`[mock] stateful Cortex mock (${profile}) at http://127.0.0.1:${port}  (demo driver: POST /_demo/next)`));
}
