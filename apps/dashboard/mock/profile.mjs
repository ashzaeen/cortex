// Engine options for the demo profile (apps/dashboard/demo/). Shared by the HTTP mock
// (`--profile demo`) and the in-browser demo (lib/demo.ts), which each load the JSON their own way.
//
// The profile is written as one week ending on ANCHOR (the demo day). The engine shifts it so
// ANCHOR is always today for whoever opens the demo.
export const ANCHOR = "2026-11-15";
export const PROFILE_FILES = ["owner", "people", "moments", "promises", "actions", "receipts", "modes", "extras"];
export const ASSETS = { booth: "/demo-snaps/acme-booth.jpg", card: "/demo-snaps/business-card.svg" };

/** @param {Record<string, any>} files the parsed JSON files, keyed by PROFILE_FILES */
export function demoEngineOptions(files) {
  const { owner, ...data } = files;
  return { load: () => data, anchor: ANCHOR, owner, assets: ASSETS };
}

/** The demo profile's extras (extras.json): routines, the caregiver (set up, never consented), list items, immersion words and a
 *  finished coach session, so every feature has something to show. Goes through the engine's own routes. */
export function seedExtras(engine, extras) {
  if (!extras) return;
  for (const r of extras.routines ?? []) engine.handle("POST", "/routines", { title: r.title, time: r.time, days: r.days, spoken: r.spoken });
  if (extras.caregiver) engine.handle("PUT", "/caregiver", { consent: false, name: extras.caregiver.name, email: extras.caregiver.email, send_at: extras.caregiver.send_at });
  for (const [list, items] of Object.entries(extras.lists ?? {})) for (const it of items) engine.handle("POST", `/lists/${list}/items`, it);
  engine.handle("POST", "/_demo/skills-seed", { vocab: extras.vocab ?? [], coach_sessions: extras.coach_sessions ?? [] });
}
