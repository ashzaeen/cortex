// make dev: start the mock API, and the dashboard against it if the dashboard exists.
// Set CORTEX_API_URL to point the dashboard at a real backend instead of the mock.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { exists, root, spawnArgs } from "./lib.mjs";

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

if (apiUrl === MOCK_URL) {
  console.log(`[dev] mock API from contracts/openapi.yaml at ${MOCK_URL}`);
  start("mock", "npx", ["prism", "mock", "contracts/openapi.yaml", "--port", "4010", "--host", "127.0.0.1"], root);
} else {
  console.log(`[dev] using CORTEX_API_URL=${apiUrl}; not starting the mock`);
}

if (exists("apps/dashboard/package.json")) {
  console.log(`[dev] dashboard: npm run dev (CORTEX_API_URL=${apiUrl})`);
  start("dashboard", "npm", ["run", "dev"], join(root, "apps/dashboard"), { CORTEX_API_URL: apiUrl });
} else {
  console.log("[dev] apps/dashboard is a stub (no package.json yet), so only the mock API runs.");
  console.log(`[dev] try: curl ${MOCK_URL}/people   |   Ctrl+C to stop`);
}
if (!children.length) process.exit(0);
