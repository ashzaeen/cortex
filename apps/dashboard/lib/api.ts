// Typed client for the Cortex API, through the same-origin /api proxy.
// Types are generated from contracts/openapi.yaml: run `npm run types` after a contract change.
import type { components } from "./api-types";
import { apiBase, apiHeaders, demoFallbackEngine, visitorId } from "./demo";

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
/** The user's changes from the edit sheet; only the payload the action carries is read by the backend. */
export type ActionEdits = Partial<{
  draft: { to?: string; subject?: string; body?: string };
  event: { title?: string; start?: string; end?: string; location?: string; description?: string };
  task: { title?: string; notes?: string; due?: string };
  doc: { title?: string; body?: string };
  message: { to?: string; text?: string };
  expense: { label?: string; amount?: number };
}>;
export type PrivacyState = S["PrivacyState"];
export type Call = S["Call"];
export type ModeSuggestion = S["ModeSuggestion"];
export type ModeUpdate = S["ModeUpdate"];
export type ModeCreate = S["ModeCreate"];
export type Recap = S["Recap"];
export type LookResult = S["LookResult"];
export type LookTask = LookResult["task"];
export type Routine = S["routine.schema"];
export type RoutineIn = S["RoutineIn"];
export type RoutineUpdate = S["RoutineUpdate"];
export type Caregiver = S["Caregiver"];
export type CaregiverIn = S["CaregiverIn"];
export type CortexList = S["List"];
export type ListItem = S["list-item.schema"];
export type Digest = S["Digest"];
export type Rewind = S["Rewind"];

// Mock-only demo driver (apps/dashboard/mock); absent on the real backend.
export type DemoStep = { i: number; beat: string; label: string; you: string; done: boolean };
export type DemoState = { index: number; total: number; owner?: string | null; steps: DemoStep[] };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const engine = await demoFallbackEngine();
  if (engine) {
    // /demo: answer from the in-tab engine. Copy, so the UI never holds the engine's live objects.
    const out = engine.handle(method, path, body ?? null);
    const data = JSON.parse(JSON.stringify(out.body));
    if (out.status >= 400) throw new ApiError(out.status, data?.error?.code ?? "error", data?.error?.message ?? `Request failed (${out.status})`);
    return data as T;
  }
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { ...apiHeaders(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
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
  currentCall: () => call<{ call: Call | null }>("GET", "/calls/current"),
  modes: () => call<{ items: Mode[]; suggestion?: ModeSuggestion | null }>("GET", "/modes"),
  activateMode: (id: Mode["id"]) => call<Mode>("POST", `/modes/${encodeURIComponent(id)}/activate`),
  updateMode: (id: Mode["id"], body: ModeUpdate) => call<Mode>("PATCH", `/modes/${encodeURIComponent(id)}`, body),
  createMode: (body: ModeCreate) => call<Mode>("POST", "/modes", body),
  deleteMode: (id: Mode["id"]) => call<{ deleted: string }>("DELETE", `/modes/${encodeURIComponent(id)}`),
  dismissModeSuggestion: () => call<{ dismissed: boolean }>("POST", "/modes/suggestion/dismiss"),
  recap: (kind: "meeting" | "lecture" = "meeting", mode?: string) => call<Recap>("GET", `/recap?kind=${kind}${mode ? `&mode=${encodeURIComponent(mode)}` : ""}`),
  decisions: () => call<{ items: Moment[] }>("GET", "/moments?tag=decision&limit=100"),
  look: (body: { task: LookTask; target?: string; question?: string; snapshot_base64?: string | null }) => call<LookResult>("POST", "/look", body),
  generate: (type: "flashcards" | "notes" | "read_aloud", moment_id?: string) => call<Action>("POST", "/actions/generate", { type, moment_id }),
  routines: () => call<{ items: Routine[] }>("GET", "/routines"),
  createRoutine: (body: RoutineIn) => call<Routine>("POST", "/routines", body),
  updateRoutine: (id: string, body: RoutineUpdate) => call<Routine>("PATCH", `/routines/${encodeURIComponent(id)}`, body),
  deleteRoutine: (id: string) => call<{ deleted: string }>("DELETE", `/routines/${encodeURIComponent(id)}`),
  caregiver: () => call<Caregiver>("GET", "/caregiver"),
  setCaregiver: (body: CaregiverIn) => call<Caregiver>("PUT", "/caregiver", body),
  sendCaregiver: () => call<ActionResult>("POST", "/caregiver/send"),
  lists: () => call<{ items: CortexList[] }>("GET", "/lists"),
  addListItem: (list: string, text: string, amount?: number | null) => call<ListItem>("POST", `/lists/${list}/items`, { text, amount: amount ?? null }),
  updateListItem: (list: string, id: string, body: { text?: string; amount?: number | null; done?: boolean }) =>
    call<ListItem>("PATCH", `/lists/${list}/items/${encodeURIComponent(id)}`, body),
  deleteListItem: (list: string, id: string) => call<ListItem>("DELETE", `/lists/${list}/items/${encodeURIComponent(id)}`),
  digest: (date?: string) => call<Digest>("GET", `/digest${date ? `?date=${date}` : ""}`),
  rewind: (q: string) => call<Rewind>("GET", `/rewind?q=${encodeURIComponent(q)}`),
  ask: (question: string) => call<AskAnswer>("POST", "/ask", { question, channel: "dashboard" }),
  brief: (personId: string) => call<Brief>("GET", `/people/${encodeURIComponent(personId)}/brief`),
  ingest: (transcript: string, source: "phone" | "dashboard" = "dashboard") =>
    call<Moment>("POST", "/moments", { ts: new Date().toISOString(), source, transcript }),
  // Phone capture (#4): a snapshot (base64 JPEG, no data: prefix) plus what was said.
  capture: (body: { transcript: string | null; snapshot_base64: string | null; mode?: string }) =>
    call<Moment>("POST", "/moments", { ts: new Date().toISOString(), source: "phone", ...body }),
  confirmPromise: (id: string) => call<Promise_>("POST", `/promises/${encodeURIComponent(id)}/confirm`),
  proposeEmail: (personId: string) =>
    call<Action>("POST", "/actions/propose", { type: "follow_up_email", person_id: personId }),
  updatePerson: (id: string, body: { phone?: string | null }) => call<Person>("PATCH", `/people/${encodeURIComponent(id)}`, body),
  proposeText: (personId: string) => call<Action>("POST", "/actions/propose", { type: "message", person_id: personId }),
  confirmAction: (id: string, deliver: "send" | "draft" | "do", edits?: ActionEdits) =>
    call<ActionResult>("POST", `/actions/${encodeURIComponent(id)}/confirm`, { deliver, ...edits }),
  dismissAction: (id: string) => call<ActionResult>("POST", `/actions/${encodeURIComponent(id)}/dismiss`),
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
// repo-relative (fixtures/...), served by the API. The API's own files (/snapshots, /videos,
// /fixtures) always load through the /api proxy, which holds the API key, even when the backend
// hands out an absolute URL: the browser never talks to the backend directly.
const API_FILE = /^\/(snapshots|videos|fixtures)\//;
// <img> and <video> cannot send headers, so on /demo the visitor id rides in the query string.
const withVisitor = (path: string) => (apiBase() === "/api/demo" ? `${apiBase()}${path}${path.includes("?") ? "&" : "?"}visitor=${visitorId()}` : `${apiBase()}${path}`);
function mediaSrc(url: string | null | undefined) {
  if (!url) return null;
  if (/^https?:/.test(url)) {
    try {
      const path = new URL(url).pathname;
      return API_FILE.test(path) ? withVisitor(path) : url;
    } catch { return url; }
  }
  return /^(data:|\/)/.test(url) ? url : withVisitor(`/${url}`);
}
export const snapshotSrc = mediaSrc;
export const videoSrc = mediaSrc;
