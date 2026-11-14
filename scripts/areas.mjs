// Run a make target in every area that has its own Makefile; explain stubs instead of failing.
// Usage: node scripts/areas.mjs <setup|test|lint|seed>
import { AREAS, exists, run } from "./lib.mjs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/areas.mjs <target>");
  process.exit(2);
}

let failed = 0;
for (const area of AREAS) {
  const dir = `apps/${area}`;
  if (!exists(`${dir}/Makefile`)) {
    console.log(`  ${dir}: stub, no Makefile yet (skipping '${target}')`);
    continue;
  }
  console.log(`  ${dir}: make ${target}`);
  const code = run("make", ["-C", dir, target]);
  if (code !== 0) {
    console.error(`  ${dir}: '${target}' failed (exit ${code})`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
