// Print what works (docs/STATUS.md) and the open Tier 0 issues (GitHub).
import { capture, statusRows } from "./lib.mjs";

const rows = statusRows();
const pad = (s, n) => String(s).padEnd(n);
console.log("Tier 0 status (docs/STATUS.md)\n");
console.log(`${pad("id", 6)} ${pad("state", 12)} ${pad("last verified", 22)} item`);
for (const r of rows) console.log(`${pad(r.id, 6)} ${pad(r.state, 12)} ${pad(r.verified, 22)} ${r.item}`);
const works = rows.filter((r) => r.state === "works").length;
console.log(`\n${works}/11 Tier 0 items work.${works < 11 ? " Tier 1 work stays closed until all 11 pass twice in a row." : ""}`);

const issues = capture("gh", ["issue", "list", "--label", "tier:0", "--state", "open", "--limit", "50",
  "--json", "number,title,assignees,labels",
  "--template", '{{range .}}#{{.number}}\t{{.title}}\t{{range .assignees}}@{{.login}} {{end}}\n{{end}}']);
if (issues === null) {
  console.log("\n(gh not available or not authenticated: run `gh auth login` to see open Tier 0 issues)");
} else {
  console.log("\nOpen Tier 0 issues (gh issue list --label tier:0):\n");
  console.log(issues.trim() || "  none");
}
