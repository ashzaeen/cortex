// Create or update the repo's labels and milestones. Safe to re-run.
// Usage: node scripts/setup-github.mjs   (needs gh, authenticated, run inside the repo)
import { capture, run } from "./lib.mjs";

const LABELS = [
  ["tier:0", "b60205", "Must work for the demo"],
  ["tier:1", "fbca04", "Stretch: only after Tier 0 passes twice"],
  ["tier:cut", "cccccc", "Cut for the hackathon (roadmap only)"],
  ["area:capture", "1d76db", "apps/capture: glasses and phone"],
  ["area:backend", "1d76db", "apps/backend: memory API and brain"],
  ["area:dashboard", "1d76db", "apps/dashboard: companion web app"],
  ["area:call", "1d76db", "apps/call-agent: Chert and LiveKit"],
  ["area:contracts", "1d76db", "contracts/: API and schemas"],
  ["area:demo", "1d76db", "fixtures, demo script, rehearsal, submission"],
  ["area:infra", "1d76db", "Makefile, scripts, CI, repo setup"],
  ["type:task", "5319e7", "Build work"],
  ["type:spike", "5319e7", "Time-boxed investigation"],
  ["type:bug", "d73a4a", "Something is broken"],
  ["type:decision", "5319e7", "Needs an ADR decision"],
  ["status:in-progress", "0e8a16", "Claimed and being worked on"],
  ["status:blocked", "e99695", "Cannot continue; names the blocking issue"],
  ["status:needs-review", "0e8a16", "Pushed; waiting for someone to run the done-when test"],
  ["needs-human", "d93f0b", "Only a person can decide or act"],
  ["contract-change", "f9d0c4", "Changes contracts/; affected owners mentioned"],
  ["agent-ready", "0e8a16", "Clear enough for an agent to start"],
];

const MILESTONES = [
  ["M0 Go/no-go checks", "Spikes that decide the plan. Switch to the fallback the same day if one fails."],
  ["M1 Walking skeleton", "Fake end-to-end on mocks: every area runs against the mock API and fixtures."],
  ["M2 Tier 0 complete", "All of T0-1 to T0-11 work, twice in a row."],
  ["M3 Rehearsal and feature freeze", "Freeze at least 6 h before judging; 10+ rehearsal runs; backup video."],
  ["M4 Submission", "Devpost writeup and the Chert track submission."],
];

let failed = 0;
for (const [name, color, description] of LABELS) {
  if (run("gh", ["label", "create", name, "--color", color, "--description", description, "--force"]) !== 0) failed++;
}

const existing = JSON.parse(capture("gh", ["api", "repos/{owner}/{repo}/milestones?state=all&per_page=100"]) ?? "[]").map((m) => m.title);
for (const [title, description] of MILESTONES) {
  if (existing.includes(title)) {
    console.log(`milestone exists: ${title}`);
    continue;
  }
  if (run("gh", ["api", "repos/{owner}/{repo}/milestones", "-f", `title=${title}`, "-f", `description=${description}`, "--silent"]) !== 0) failed++;
  else console.log(`milestone created: ${title}`);
}
process.exit(failed ? 1 : 0);
