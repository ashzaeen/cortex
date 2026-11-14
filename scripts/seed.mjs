// Seed the backend with fixtures/. Fixtures are validated first; loading is the backend's job.
import { exists, run } from "./lib.mjs";

if (run("node", ["scripts/check-contracts.mjs"]) !== 0) process.exit(1);
if (exists("apps/backend/Makefile")) process.exit(run("make", ["-C", "apps/backend", "seed"]));
console.log(
  "seed: fixtures are valid, but apps/backend has no Makefile yet, so there is nothing to load them into.\n" +
  "      The mock API (make mock) serves the examples in contracts/openapi.yaml instead.\n" +
  "      When the backend lands, add a 'seed' target to apps/backend/Makefile that loads fixtures/*.json."
);
