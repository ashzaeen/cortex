// Engine options for the demo profile (apps/dashboard/demo/). Shared by the HTTP mock
// (`--profile demo`) and the in-browser demo (lib/demo.ts), which each load the JSON their own way.
//
// The profile is written as one week ending on ANCHOR (the demo day). The engine shifts it so
// ANCHOR is always today for whoever opens the demo.
export const ANCHOR = "2026-11-15";
export const PROFILE_FILES = ["owner", "people", "moments", "promises", "actions", "receipts", "modes"];
export const ASSETS = { booth: "/demo-snaps/acme-booth.jpg", card: "/demo-snaps/business-card.svg" };

/** @param {Record<string, any>} files the parsed JSON files, keyed by PROFILE_FILES */
export function demoEngineOptions(files) {
  const { owner, ...data } = files;
  return { load: () => data, anchor: ANCHOR, owner, assets: ASSETS };
}
