// Repo hygiene: no .env files or likely secrets tracked, and relative Markdown links resolve.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { capture, read, root } from "./lib.mjs";

const files = (capture("git", ["ls-files", "--cached", "--others", "--exclude-standard"]) ?? "")
  .split("\n").map((f) => f.trim()).filter(Boolean).filter((f) => existsSync(join(root, f)));
const errors = [];

// 1. Secrets.
const SECRET_PATTERNS = [
  [/\bftk_[A-Za-z0-9]{8,}/, "Chert API key"],
  [/\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}/, "model API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "GitHub token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(LIVEKIT_API_SECRET|LIVEKIT_API_KEY|CHERT_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)=\S+/, "filled-in key"],
  [/(mongodb(\+srv)?|postgres(ql)?):\/\/[^\s:@<]+:[^\s@<>]+@/, "database URL with password"],
];
for (const f of files) {
  if (/(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith(".env.example")) errors.push(`${f}: .env files must not be committed`);
  if (/\.(pdf|png|jpe?g|gif|ico|lock)$/.test(f) || f.endsWith("package-lock.json")) continue;
  const text = read(f);
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) errors.push(`${f}: looks like a ${what}`);
}

// 2. Relative Markdown links.
for (const f of files.filter((f) => f.endsWith(".md"))) {
  const text = read(f).replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]);
    if (path && !existsSync(join(root, dirname(f), path))) errors.push(`${f}: broken link ${target}`);
  }
}

if (errors.length) {
  console.error("repo: problems\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log(`repo: OK (${files.length} files scanned for secrets and broken links)`);
