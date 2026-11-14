// make dev: start a mock API, and the dashboard against it if the dashboard exists.
// Mock: the stateful one in apps/dashboard/mock (remembers posts, streams /events, Ash demo driver),
// or Prism straight from the contract with MOCK=prism. CORTEX_API_URL points at a real backend instead.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { exists, root, run, spawnArgs } from "./lib.mjs";

const MOCK_URL = "http://127.0.0.1:4010";
const apiUrl = process.env.CORTEX_API_URL || MOCK_URL;
const children = [];
const start = (name, cmd, args, cwd, env = {}) => {
  const [c, a, o] = spawnArgs(cmd, args);
  const child = spawn(c, a, { cwd, stdio: "inherit", ...o, env: { ...process.env, ...env } });
  child.on("exit", (code) => {
    console.log(`[dev] ${name} exited (${code})`);
    stopAll(code ?? 0);
  });
  children.push(child);
};
const stopAll = (code) => {
  for (const c of children) if (!c.killed) c.kill();
  process.exit(code);
};
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

const stateful = exists("apps/dashboard/mock/server.mjs") && process.env.MOCK !== "prism";
if (apiUrl === MOCK_URL && stateful) {
  console.log(`[dev] stateful mock (apps/dashboard/mock) at ${MOCK_URL}; MOCK=prism for the plain contract mock`);
  start("mock", "node", ["apps/dashboard/mock/server.mjs", "--port", "4010"], root);
} else if (apiUrl === MOCK_URL) {
  console.log(`[dev] Prism mock from contracts/openapi.yaml at ${MOCK_URL}`);
  start("mock", "npx", ["prism", "mock", "contracts/openapi.yaml", "--port", "4010", "--host", "127.0.0.1"], root);
} else {
  console.log(`[dev] using CORTEX_API_URL=${apiUrl}; not starting the mock`);
}

if (exists("apps/dashboard/package.json")) {
  if (!exists("apps/dashboard/node_modules")) run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: join(root, "apps/dashboard") });
  console.log(`[dev] dashboard: npm run dev (CORTEX_API_URL=${apiUrl})`);
  start("dashboard", "npm", ["run", "dev"], join(root, "apps/dashboard"), { CORTEX_API_URL: apiUrl });
  console.log("[dev] open http://localhost:3000 (on a phone on the same wifi: http://<this laptop's IP>:3000)");
} else {
  console.log("[dev] apps/dashboard is a stub (no package.json yet), so only the mock API runs.");
  console.log(`[dev] try: curl ${MOCK_URL}/people   |   Ctrl+C to stop`);
}
if (!children.length) process.exit(0);
