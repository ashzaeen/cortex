// Print the demo checklist (docs/STATUS.md) and its open issues (GitHub).
import { capture, statusRows } from "./lib.mjs";

const rows = statusRows();
const pad = (s, n) => String(s).padEnd(n);
console.log("Demo checklist (docs/STATUS.md)\n");
console.log(`${pad("id", 6)} ${pad("state", 12)} ${pad("last verified", 22)} item`);
for (const r of rows) console.log(`${pad(r.id, 6)} ${pad(r.state, 12)} ${pad(r.verified, 22)} ${r.item}`);
const works = rows.filter((r) => r.state === "works").length;
console.log(`\n${works}/11 demo checklist items work.`);

const issues = capture("gh", ["issue", "list", "--label", "demo-checklist", "--state", "open", "--limit", "50",
  "--json", "number,title,assignees,labels",
  "--template", '{{range .}}#{{.number}}\t{{.title}}\t{{range .assignees}}@{{.login}} {{end}}\n{{end}}']);
if (issues === null) {
  console.log("\n(gh not available or not authenticated: run `gh auth login` to see open checklist issues)");
} else {
  console.log("\nOpen checklist issues (gh issue list --label demo-checklist):\n");
  console.log(issues.trim() || "  none");
}
