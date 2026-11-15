// Typed client for the skills (contracts/openapi.yaml, tag "skills"). Kept apart from lib/api.ts so Skills and Modes
// can change independently. Types mirror the contract's components.schemas; after the Modes work lands, they can be
// swapped for the generated ones (`npm run types`).
import { ApiError, type Moment, type Person, type Promise_ } from "./api";
import { demoEngine } from "./demo";

export type SkillId = "network" | "waiting" | "brief" | "world" | "translate" | "immersion" | "nudge" | "coach";
export type SkillInfo = {
  id: SkillId; code: string; name: string; tagline: string; best_mode: string; uses_view: boolean; trigger: string; inputs: string;
  steps: string[]; output: string; confirmation: string; undo: string; source_moment: string; if_unsure: string; enabled: boolean;
};
export type View = { snapshot_base64?: string | null; moment_id?: string; source?: "glasses" | "device" };
export type GlassesView = { available: boolean; moment_id: string | null; age_seconds: number | null; message: string | null };
type Said = { spoken: string; text: string };
export type WorldResult = Said & { confidence: number; unsure: boolean; saved: boolean; moment: Moment | null };
export type TranslateResult = Said & { original: string; translation: string; source_language: string; target_language: string; confidence: number; unsure: boolean; moment: Moment | null };
export type VocabItem = { id: string; language: string; object: string; word: string; box: number; right: number; wrong: number; source_moment_id: string | null; created_at: string };
export type NameResult = Said & { items: VocabItem[]; language: string; moment: Moment | null };
export type Quiz = { vocab_id: string; language: string; object: string; box: number; prompt: string; choices: string[] };
export type QuizResult = Said & { correct: boolean; expected: string; box: number };
export type ProactiveSettings = { enabled: boolean; dwell_seconds: number; cooldown_minutes: number };
export type Offer = { id: string; scene: string; text: string; status: "offered" | "accepted" | "dismissed"; created_at: string };
export type Observation = { offered: boolean; reason: string; dwell_seconds: number; offer: Offer | null };
export type CoachSession = { id: string; goal: string; steps: string[]; step_index: number; current_step: string | null; status: "active" | "done" | "ended"; mistakes: number; moment_id: string | null; created_at: string };
export type CoachReply = Said & { session: CoachSession; mistake: string | null };
export type NudgeSettings = { enabled: boolean; quiet_start: string; quiet_end: string; daily_cap: number };
export type Nudge = { id: string; promise_id: string; person_id: string; direction: "waiting_on" | "i_owe"; spoken: string; text: string; days_overdue: number; status: "open" | "dismissed"; source_moment_id: string; created_at: string };
export type BriefDue = { person_id: string; event_title: string; event_start: string; spoken: string; bullets: string[] };
export type BriefCall = { id: string; person_id: string; status: "requested" | "dialing" | "completed" | "failed"; spoken: string; created_at: string };
export type PersonMatch = { person: Person; matched: string[] };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const engine = demoEngine();
  if (engine) {
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

const enc = encodeURIComponent;
export const skillsApi = {
  list: () => call<{ items: SkillInfo[] }>("GET", "/skills"),
  glasses: () => call<GlassesView>("GET", "/skills/view"),
  searchPeople: (q: string) => call<{ items: PersonMatch[] }>("GET", `/skills/people/search?q=${enc(q)}`),
  world: (b: View & { question?: string | null; save?: boolean }) => call<WorldResult>("POST", "/skills/world", b),
  translate: (b: { text: string; target_language?: string; save?: boolean }) => call<TranslateResult>("POST", "/skills/translate", b),
  translateSettings: () => call<{ target_language: string; source_language: string }>("GET", "/skills/translate/settings"),
  setTranslateSettings: (b: { target_language?: string; source_language?: string }) => call<{ target_language: string; source_language: string }>("PUT", "/skills/translate/settings", b),
  nameObjects: (b: View & { language?: string }) => call<NameResult>("POST", "/skills/immersion/name", b),
  vocab: () => call<{ items: VocabItem[] }>("GET", "/skills/immersion/vocab"),
  deleteWord: (id: string) => call<{ deleted: boolean }>("DELETE", `/skills/immersion/vocab/${enc(id)}`),
  quiz: () => call<Quiz>("GET", "/skills/immersion/quiz"),
  answerQuiz: (vocab_id: string, answer: string) => call<QuizResult>("POST", "/skills/immersion/quiz", { vocab_id, answer }),
  immersionSettings: () => call<{ language: string }>("GET", "/skills/immersion/settings"),
  setImmersionSettings: (language: string) => call<{ language: string }>("PUT", "/skills/immersion/settings", { language }),
  proactive: () => call<ProactiveSettings>("GET", "/skills/proactive/settings"),
  setProactive: (b: Partial<ProactiveSettings>) => call<ProactiveSettings>("PUT", "/skills/proactive/settings", b),
  observe: (b: View) => call<Observation>("POST", "/skills/proactive/observe", b),
  offers: () => call<{ items: Offer[] }>("GET", "/skills/proactive/offers"),
  acceptOffer: (id: string, b: View = {}) => call<WorldResult>("POST", `/skills/proactive/offers/${enc(id)}/accept`, b),
  dismissOffer: (id: string) => call<{ id: string; status: string }>("POST", `/skills/proactive/offers/${enc(id)}/dismiss`),
  startCoach: (goal: string, v: View = {}) => call<CoachReply>("POST", "/skills/coach", { goal, ...v }),
  coachStep: (id: string, said: string | null, v: View = {}) => call<CoachReply>("POST", `/skills/coach/${enc(id)}/step`, { said, ...v }),
  endCoach: (id: string) => call<CoachSession>("POST", `/skills/coach/${enc(id)}/end`),
  nudgeSettings: () => call<NudgeSettings>("GET", "/skills/nudges/settings"),
  setNudgeSettings: (b: Partial<NudgeSettings>) => call<NudgeSettings>("PUT", "/skills/nudges/settings", b),
  nudges: () => call<{ items: Nudge[] }>("GET", "/skills/nudges"),
  dismissNudge: (id: string) => call<Nudge>("POST", `/skills/nudges/${enc(id)}/dismiss`),
  completePromise: (id: string) => call<Promise_>("POST", `/promises/${enc(id)}/done`),
  autoBrief: () => call<{ enabled: boolean }>("GET", "/skills/brief/settings"),
  setAutoBrief: (enabled: boolean) => call<{ enabled: boolean }>("PUT", "/skills/brief/settings", { enabled }),
  briefCall: (person_id: string) => call<BriefCall>("POST", "/skills/brief/call", { person_id }),
};

/** Event types the skills add (nudge.due, brief.due, brief.call, skill.offer, coach.updated). */
export const SKILL_EVENTS = ["nudge.due", "brief.due", "brief.call", "skill.offer", "coach.updated"] as const;
export type SkillEvent = (typeof SKILL_EVENTS)[number];
