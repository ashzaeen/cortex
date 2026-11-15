// Exports the Brass tokens (design.md 19.2) to tokens.json for the native iOS app (design.md 20).
// Single source is app/globals.css. `node scripts/build-tokens.mjs` writes; `--check` fails on drift.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(`${root}app/globals.css`, "utf8");
const block = css.slice(css.indexOf(":root {") + 7, css.indexOf("}", css.indexOf(":root {")));
const vars = Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, " ")]));

const pick = (test) => Object.fromEntries(Object.entries(vars).filter(([k]) => test(k)));
const px = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number.parseFloat(v)]));

const tokens = {
  $comment: "Generated from app/globals.css by scripts/build-tokens.mjs. Do not edit by hand.",
  color: pick((k) => ["bg", "bg-deep", "ink", "text", "text-2", "text-3", "text-4", "brass", "brass-hi", "brass-lo", "brass-wash", "ok", "danger"].includes(k)),
  ambient: pick((k) => k.startsWith("amb-")),
  surface: pick((k) => ["veil", "edge", "divider", "fill-soft", "fill-press", "glass-tint", "glass-blur", "glass-solid", "matte", "dim"].includes(k)),
  space: px(pick((k) => /^s-\d+$/.test(k))),
  radius: px(pick((k) => /^r-/.test(k))),
  duration: px(pick((k) => k.startsWith("dur-"))),
  easing: pick((k) => k.startsWith("ease-")),
  spring: { snappy: { stiffness: 380, damping: 30, mass: 1 }, gentle: { stiffness: 220, damping: 26, mass: 1 }, bouncy: { stiffness: 300, damping: 18, mass: 1 } },
  font: { ui: "Manrope", voice: "Fraunces", data: "JetBrains Mono" },
};

const out = JSON.stringify(tokens, null, 2) + "\n";
const file = `${root}tokens.json`;
if (process.argv.includes("--check")) {
  if (!existsSync(file) || readFileSync(file, "utf8") !== out) {
    console.error("tokens.json is out of date with app/globals.css. Run: npm run tokens");
    process.exit(1);
  }
  console.log(`tokens.json matches globals.css (${Object.keys(vars).length} variables)`);
} else {
  writeFileSync(file, out);
  console.log(`wrote tokens.json (${Object.keys(vars).length} variables)`);
}
