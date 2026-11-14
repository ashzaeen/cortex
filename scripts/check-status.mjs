// Guard docs/STATUS.md against drift and placeholder success.
// Every T0 id appears once, states are valid, and "works" or "broken" rows name who verified them and when.
import { statusRows } from "./lib.mjs";

const STATES = ["not started", "in progress", "works", "broken"];
const VERIFIED = /^\d{4}-\d{2}-\d{2} @[A-Za-z0-9-]+$/;
const errors = [];
const rows = statusRows();

for (let n = 1; n <= 11; n++) {
  const id = `T0-${n}`;
  const found = rows.filter((r) => r.id === id);
  if (found.length !== 1) errors.push(`${id}: expected 1 row, found ${found.length}`);
}
for (const r of rows) {
  if (!STATES.includes(r.state)) errors.push(`${r.id}: state "${r.state}" is not one of ${STATES.join(", ")}`);
  if ((r.state === "works" || r.state === "broken") && !VERIFIED.test(r.verified))
    errors.push(`${r.id}: state "${r.state}" needs last verified as "YYYY-MM-DD @handle" (got "${r.verified}")`);
}

if (errors.length) {
  console.error("status: docs/STATUS.md problems\n - " + errors.join("\n - "));
  process.exit(1);
}
const works = rows.filter((r) => r.state === "works").length;
console.log(`status: OK (${works}/11 Tier 0 items work)`);
