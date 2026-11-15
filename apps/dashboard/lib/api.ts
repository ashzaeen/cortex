// Typed client for the Cortex API, through the same-origin /api proxy.
// Types are generated from contracts/openapi.yaml: run `npm run types` after a contract change.
import type { components } from "./api-types";
import { demoEngine } from "./demo";

type S = components["schemas"];
export type Moment = S["moment.schema"];
export type Person = S["person.schema"];
export type Promise_ = S["promise.schema"];
export type Action = S["action.schema"];
export type Receipt = S["receipt.schema"];
export type Mode = S["mode.schema"];
export type AskAnswer = S["AskAnswer"];
export type Brief = S["Brief"];
export type ActionResult = S["ActionResult"];
export type PrivacyState = S["PrivacyState"];

// Mock-only demo driver (apps/dashboard/mock); absent on the real backend.
export type DemoStep = { i: number; beat: string; label: string; you: string; done: boolean };
export type DemoState = { index: number; total: number; owner?: string | null; steps: DemoStep[] };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const engine = demoEngine();
  if (engine) {
    // /demo: answer from the in-tab engine. Copy, so the UI never holds the engine's live objects.
    const out = engine.handle(method, path, body ?? null);
    const data = JSON.parse(JSON.stringify(out.body));
    if (out.status >= 400) throw new ApiError(out.status, data?.error?.code ?? "error", data?.error?.message ?? `Request failed (${out.status})`);
    return data as T;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  moments: () => call<{ items: Moment[] }>("GET", "/moments?limit=100"),
  people: () => call<{ items: Person[] }>("GET", "/people"),
  promises: () => call<{ items: Promise_[] }>("GET", "/promises"),
  actions: () => call<{ items: Action[] }>("GET", "/actions"),
  receipts: () => call<{ items: Receipt[] }>("GET", "/receipts"),
  privacy: () => call<PrivacyState>("GET", "/privacy"),
  modes: () => call<{ items: Mode[] }>("GET", "/modes"),
  activateMode: (id: Mode["id"]) => call<Mode>("POST", `/modes/${id}/activate`),
  ask: (question: string) => call<AskAnswer>("POST", "/ask", { question, channel: "dashboard" }),
  brief: (personId: string) => call<Brief>("GET", `/people/${encodeURIComponent(personId)}/brief`),
  ingest: (transcript: string, source: "phone" | "dashboard" = "dashboard") =>
    call<Moment>("POST", "/moments", { ts: new Date().toISOString(), source, transcript }),
  // Phone capture (#4): a snapshot (base64 JPEG, no data: prefix) plus what was said.
  capture: (body: { transcript: string | null; snapshot_base64: string | null }) =>
    call<Moment>("POST", "/moments", { ts: new Date().toISOString(), source: "phone", ...body }),
  confirmPromise: (id: string) => call<Promise_>("POST", `/promises/${encodeURIComponent(id)}/confirm`),
  proposeEmail: (personId: string) =>
    call<Action>("POST", "/actions/propose", { type: "follow_up_email", person_id: personId }),
  confirmAction: (id: string, deliver: "send" | "draft" | "do") =>
    call<ActionResult>("POST", `/actions/${encodeURIComponent(id)}/confirm`, { deliver }),
  undoAction: (id: string) => call<ActionResult>("POST", `/actions/${encodeURIComponent(id)}/undo`),
  setPrivacy: (state: PrivacyState["state"]) => call<PrivacyState>("POST", "/privacy/pause", { state }),
  deleteMoment: (id: string) => call<Receipt>("DELETE", `/moments/${encodeURIComponent(id)}`),
  demo: {
    state: () => call<DemoState>("GET", "/_demo"),
    next: () => call<DemoState>("POST", "/_demo/next"),
    play: () => call<DemoState>("POST", "/_demo/play"),
    reset: () => call<DemoState>("POST", "/_demo/reset"),
  },
};

// Snapshot URLs may be absolute, site-relative (/demo-snaps/..., served from public/) or
// repo-relative (fixtures/...), served by the API.
export const snapshotSrc = (url: string | null | undefined) =>
  !url ? null : /^(https?:|data:|\/)/.test(url) ? url : `/api/${url}`;
