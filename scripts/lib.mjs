// Shared helpers for repo scripts. Node stdlib only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const read = (p) => readFileSync(join(root, p), "utf8");
export const exists = (p) => existsSync(join(root, p));
export const AREAS = ["backend", "dashboard", "capture", "call-agent"];
export const isWin = process.platform === "win32";
// npm and npx are .cmd shims on Windows and need a shell; real executables do not.
export const needsShell = (cmd) => isWin && (cmd === "npm" || cmd === "npx");
// Spawn arguments: npm/npx on Windows get one command string (args here are fixed, never user input).
export const spawnArgs = (cmd, args) =>
  needsShell(cmd) ? [[cmd, ...args].join(" "), [], { shell: true }] : [cmd, args, { shell: false }];

// Run a command in the repo, streaming output. Returns the exit code.
export function run(cmd, args, opts = {}) {
  const [c, a, o] = spawnArgs(cmd, args);
  const r = spawnSync(c, a, { cwd: root, stdio: "inherit", ...o, ...opts });
  return r.status ?? 1;
}

// Run and capture stdout; returns null if the command is missing or fails.
export function capture(cmd, args) {
  const [c, a, o] = spawnArgs(cmd, args);
  const r = spawnSync(c, a, { cwd: root, encoding: "utf8", ...o });
  return r.status === 0 ? r.stdout : null;
}

// Parse the Tier 0 table in docs/STATUS.md into row objects.
export function statusRows() {
  return read("docs/STATUS.md")
    .split("\n")
    .filter((l) => /^\|\s*T0-\d+\s*\|/.test(l))
    .map((l) => {
      const [id, item, state, verified, issue, notes] = l.split("|").slice(1, -1).map((c) => c.trim());
      return { id, item, state, verified, issue, notes };
    });
}
