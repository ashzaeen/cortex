// The public demo (/demo) talks to the REAL backend through /api/demo (app/api/demo): every skill, mode and
// feature is live, on a private copy of the demo profile per visitor. If that backend cannot be reached (or the
// page is opened with ?engine=1) it falls back to the mock engine running in this browser tab, so the demo never
// breaks. The engine has no model: it answers from simple rules and does not look at pictures.
import { createEngine, type Engine } from "@/mock/engine.mjs";
import { demoEngineOptions, seedExtras } from "@/mock/profile.mjs";
import owner from "@/demo/owner.json";
import people from "@/demo/people.json";
import moments from "@/demo/moments.json";
import promises from "@/demo/promises.json";
import actions from "@/demo/actions.json";
import receipts from "@/demo/receipts.json";
import modes from "@/demo/modes.json";
import extras from "@/demo/extras.json";

export const DEMO_OWNER = owner;
let engine: Engine | null = null;

/** True on /demo pages in the browser. */
export const isDemo = () => typeof window !== "undefined" && /^\/demo(\/|$)/.test(window.location.pathname);

/** The tab's demo engine, created on first use; null outside /demo. */
export function demoEngine(): Engine | null {
  if (!isDemo()) return null;
  if (!engine) {
    engine = createEngine(demoEngineOptions({ owner, people, moments, promises, actions, receipts, modes }));
    seedExtras(engine, extras);
  }
  return engine;
}

const VISITOR_KEY = "cortex.demo.visitor";
let visitor: string | null = null;

/** A random id for this browser: the backend turns it into a private demo memory. Kept in localStorage. */
export function visitorId(): string {
  if (visitor) return visitor;
  try { visitor = localStorage.getItem(VISITOR_KEY); } catch { /* storage blocked */ }
  if (!visitor || !/^[a-f0-9]{16,40}$/.test(visitor)) {
    const b = crypto.getRandomValues(new Uint8Array(12));
    visitor = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    try { localStorage.setItem(VISITOR_KEY, visitor); } catch { /* storage blocked */ }
  }
  return visitor;
}

let backendOn = false;
let probe: Promise<boolean> | null = null;

/** Resolves true when /demo should use the real backend. Probes once; every API call awaits it. */
export function demoBackend(): Promise<boolean> {
  if (!isDemo()) return Promise.resolve(false);
  probe ??= (async () => {
    if (new URLSearchParams(location.search).get("engine") === "1") return false;
    try {
      const res = await fetch("/api/demo/health", { headers: { "x-demo-visitor": visitorId() }, cache: "no-store" });
      const body = await res.json().catch(() => null);
      backendOn = res.ok && body?.ok === true;
      // An older backend (no skills routes yet) would leave half the demo broken: fall back to the engine instead.
      if (backendOn) backendOn = (await fetch("/api/demo/skills", { headers: { "x-demo-visitor": visitorId() }, cache: "no-store" })).ok;
    } catch { backendOn = false; }
    return backendOn;
  })();
  return probe;
}

/** The base path for API calls: the demo proxy on /demo (once the backend is known to be up), else /api. */
export const apiBase = () => (isDemo() && backendOn ? "/api/demo" : "/api");
/** Headers every call needs on /demo. */
export const apiHeaders = (): Record<string, string> => (isDemo() && backendOn ? { "x-demo-visitor": visitorId() } : {});

/** The in-tab engine, only when /demo cannot use the real backend. Await this before deciding. */
export async function demoFallbackEngine(): Promise<Engine | null> {
  if (!isDemo()) return null;
  return (await demoBackend()) ? null : demoEngine();
}

/** The live event stream. EventSource cannot set headers, so on /demo the visitor id rides in the query string. */
export const eventsUrl = () => (isDemo() && backendOn ? `/api/demo/events?visitor=${visitorId()}` : "/api/events");
