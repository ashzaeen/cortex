// The public demo (/demo): the mock engine runs in this browser tab with the demo profile, so it
// needs no backend, and every visitor gets a private copy that resets on reload or with Reset.
import { createEngine, type Engine } from "@/mock/engine.mjs";
import { demoEngineOptions } from "@/mock/profile.mjs";
import owner from "@/demo/owner.json";
import people from "@/demo/people.json";
import moments from "@/demo/moments.json";
import promises from "@/demo/promises.json";
import actions from "@/demo/actions.json";
import receipts from "@/demo/receipts.json";
import modes from "@/demo/modes.json";

export const DEMO_OWNER = owner;
let engine: Engine | null = null;

/** True on /demo pages in the browser. */
export const isDemo = () => typeof window !== "undefined" && /^\/demo(\/|$)/.test(window.location.pathname);

/** The tab's demo engine, created on first use; null outside /demo. */
export function demoEngine(): Engine | null {
  if (!isDemo()) return null;
  engine ??= createEngine(demoEngineOptions({ owner, people, moments, promises, actions, receipts, modes }));
  return engine;
}
