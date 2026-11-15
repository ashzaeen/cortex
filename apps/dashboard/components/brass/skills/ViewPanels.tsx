"use client";
// Panels for the skills that look or listen: Ask the world, Translate, Immersion, Nudge, Coach.
import { Mic, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { friendly } from "@/lib/errors";
import { skillsApi, type CoachReply, type NameResult, type ProactiveSettings, type Quiz, type QuizResult, type SkillInfo, type TranslateResult, type VocabItem, type WorldResult } from "@/lib/skills-api";
import { useListen, voiceSupported } from "@/lib/voice";
import { Button, Chip, Label, Tag } from "../primitives";
import { speak } from "../sheets";
import { useToast } from "../Toast";
import { Field, inputCls, Said, SkillHeader, useViewSource } from "./common";

type P = { skill: SkillInfo | undefined; onOpenMoment?: (id: string) => void };
const NEED_VIEW = "Point the camera or put your glasses on first.";

function Mic_({ onText }: { onText: (t: string) => void }) {
  const v = useListen({ onInterim: onText, onFinal: onText });
  if (!voiceSupported()) return null;
  return (
    <Button variant={v.state === "listening" ? "primary" : "secondary"} aria-label={v.state === "listening" ? "Stop listening" : "Speak"} onClick={() => (v.state === "listening" ? v.stop() : v.start())}>
      <Mic aria-hidden="true" size={18} />{v.state === "listening" ? "Listening" : "Speak"}
    </Button>
  );
}

// ------------------------------------------------------------------ SKL-4 Ask the world
export function WorldPanel({ skill, onOpenMoment }: P) {
  const toast = useToast();
  const view = useViewSource("glasses");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<WorldResult | null>(null);
  async function go(question: string) {
    const v = await view.getView();
    if (!v) { toast({ text: NEED_VIEW, tone: "danger" }); return; }
    setBusy(true);
    try { const out = await skillsApi.world({ ...v, question: question || null }); setR(out); speak(out.spoken); }
    catch (e) { toast({ text: friendly(e, "Couldn't look right now. Try again."), tone: "danger" }); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      {view.picker}
      <Field label="Your Question">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What is this? Is this a good price?" onKeyDown={(e) => { if (e.key === "Enter") go(q); }} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => go(q)} disabled={busy}>{busy ? "Looking" : "Ask the World"}</Button>
        <Mic_ onText={(t) => { setQ(t); }} />
      </div>
      {r && (
        <Said spoken={r.spoken} text={r.text} unsure={r.unsure}>
          <div className="flex flex-wrap items-center gap-3">
            <Tag tone="muted">{Math.round(r.confidence * 100)}% sure</Tag>
            {r.moment ? <Button variant="ghost" onClick={() => onOpenMoment?.(r.moment!.id)}>Saved to Your Timeline</Button> : <Tag tone="muted">Not saved</Tag>}
          </div>
        </Said>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ SKL-5 Translate
const LANGS = ["spanish", "french", "german"];
export function TranslatePanel({ skill }: P) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("spanish");
  const [r, setR] = useState<TranslateResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { skillsApi.translateSettings().then((s) => setLang(s.target_language)).catch(() => {}); }, []);
  async function go(t = text) {
    if (!t.trim()) return;
    setBusy(true);
    try { const out = await skillsApi.translate({ text: t, target_language: lang }); setR(out); speak(out.spoken); }
    catch (e) { toast({ text: friendly(e, "Couldn't translate right now."), tone: "danger" }); }
    finally { setBusy(false); }
  }
  const pick = (l: string) => { setLang(l); skillsApi.setTranslateSettings({ target_language: l }).catch(() => {}); };
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      <div role="group" aria-label="Translate into" className="flex flex-wrap gap-2">
        {LANGS.map((l) => <Chip key={l} selected={lang === l} onClick={() => pick(l)}>{l[0].toUpperCase() + l.slice(1)}</Chip>)}
      </div>
      <Field label="What to Translate">
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Where is the bathroom?" onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => go()} disabled={busy}>{busy ? "Translating" : "Translate"}</Button>
        <Mic_ onText={(t) => { setText(t); }} />
      </div>
      {r && <Said spoken={r.spoken} text={r.unsure ? `I heard: “${r.original}”` : `“${r.original}” in ${r.target_language}`} unsure={r.unsure} />}
    </div>
  );
}

// ------------------------------------------------------------------ SKL-6 Immersion
export function ImmersionPanel({ skill, onOpenMoment }: P) {
  const toast = useToast();
  const view = useViewSource("glasses");
  const [lang, setLang] = useState("spanish");
  const [named, setNamed] = useState<NameResult | null>(null);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => skillsApi.vocab().then((v) => setVocab(v.items)).catch(() => {});
  useEffect(() => { skillsApi.immersionSettings().then((s) => setLang(s.language)).catch(() => {}); load(); }, []);
  async function name() {
    const v = await view.getView();
    if (!v) { toast({ text: NEED_VIEW, tone: "danger" }); return; }
    setBusy(true);
    try { const out = await skillsApi.nameObjects({ ...v, language: lang }); setNamed(out); speak(out.spoken); load(); }
    catch (e) { toast({ text: friendly(e, "Couldn't name those right now."), tone: "danger" }); }
    finally { setBusy(false); }
  }
  async function next() {
    setResult(null);
    try { setQuiz(await skillsApi.quiz()); } catch (e) { setQuiz(null); toast({ text: friendly(e, "Name a few things first."), tone: "plain" }); }
  }
  async function answer(a: string) {
    if (!quiz) return;
    try { const r = await skillsApi.answerQuiz(quiz.vocab_id, a); setResult(r); speak(r.spoken); load(); } catch (e) { toast({ text: friendly(e), tone: "danger" }); }
  }
  const pick = (l: string) => { setLang(l); skillsApi.setImmersionSettings(l).catch(() => {}); };
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      <div role="group" aria-label="Language you are learning" className="flex flex-wrap gap-2">
        {LANGS.map((l) => <Chip key={l} selected={lang === l} onClick={() => pick(l)}>{l[0].toUpperCase() + l.slice(1)}</Chip>)}
      </div>
      {view.picker}
      <Button variant="primary" className="self-start" onClick={name} disabled={busy}>{busy ? "Looking" : "Name What I See"}</Button>
      {named && (
        named.items.length === 0 ? <Said spoken={named.spoken} unsure /> : (
          <section className="nested rise flex flex-col gap-3 p-5">
            <Label>New Words</Label>
            <ul className="flex flex-col gap-2">{named.items.map((i) => <li key={i.id} className="flex items-baseline justify-between gap-3"><span className="t-headline">{i.word}</span><span className="t-callout">{i.object}</span></li>)}</ul>
            {named.moment && <Button variant="ghost" className="self-start" onClick={() => onOpenMoment?.(named.moment!.id)}>See the Moment</Button>}
          </section>
        )
      )}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><Label>Quiz</Label><Tag tone="muted">{vocab.length} word{vocab.length === 1 ? "" : "s"}</Tag></div>
        {!quiz && <Button variant="secondary" className="self-start" onClick={next}>Quiz Me</Button>}
        {quiz && (
          <div className="nested rise flex flex-col gap-4 p-5">
            <p className="t-question">{quiz.prompt}</p>
            {!result && quiz.choices.length > 0 && <div className="flex flex-wrap gap-2">{quiz.choices.map((c) => <Chip key={c} onClick={() => answer(c)}>{c}</Chip>)}</div>}
            {!result && quiz.choices.length === 0 && <QuizType onSend={answer} />}
            {result && (<><p className={result.correct ? "text-ok" : "text-danger"} role="status">{result.correct ? "Correct." : `Not quite. It's ${result.expected}.`}</p><Button variant="secondary" className="self-start" onClick={next}>Next Word</Button></>)}
          </div>
        )}
      </section>
      {vocab.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>Your Words</Label>
          <ul className="flex flex-col divide-y divide-divider">
            {vocab.slice(0, 12).map((w) => (
              <li key={w.id} className="flex min-h-11 items-center justify-between gap-3">
                <span>{w.word} <span className="t-callout">- {w.object}</span></span>
                <button type="button" className="press min-h-11 px-2 text-[0.8125rem] text-text-3" aria-label={`Forget ${w.word}`} onClick={() => skillsApi.deleteWord(w.id).then(load)}>Forget</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
function QuizType({ onSend }: { onSend: (a: string) => void }) {
  const [a, setA] = useState("");
  return (
    <div className="flex gap-2">
      <input className={inputCls} value={a} onChange={(e) => setA(e.target.value)} aria-label="Your answer" placeholder="Type the word" onKeyDown={(e) => { if (e.key === "Enter" && a.trim()) onSend(a); }} />
      <Button variant="primary" aria-label="Check answer" onClick={() => a.trim() && onSend(a)}><Send aria-hidden="true" size={18} /></Button>
    </div>
  );
}

// ------------------------------------------------------------------ SKL-7 Proactive nudge
export function NudgePanel({ skill }: P) {
  const toast = useToast();
  const [s, setS] = useState<ProactiveSettings | null>(null);
  useEffect(() => { skillsApi.proactive().then(setS).catch(() => {}); }, []);
  async function patch(b: Partial<ProactiveSettings>) {
    try { setS(await skillsApi.setProactive(b)); } catch (e) { toast({ text: friendly(e), tone: "danger" }); }
  }
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      {s && (
        <section className="nested flex flex-col gap-4 p-5">
          <label className="flex min-h-11 items-center justify-between gap-4">
            <span><span className="font-semibold">Offer help when I&rsquo;m stuck</span><span className="t-callout block">Off by default. It only ever offers, then waits for you.</span></span>
            <input type="checkbox" role="switch" className="size-6 accent-[var(--brass)]" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          </label>
          <label className="flex flex-col gap-2"><Label>Wait before offering: {s.dwell_seconds}s</Label>
            <input type="range" min={5} max={120} step={5} value={s.dwell_seconds} className="accent-[var(--brass)]" onChange={(e) => setS({ ...s, dwell_seconds: Number(e.target.value) })} onPointerUp={() => patch({ dwell_seconds: s.dwell_seconds })} onKeyUp={() => patch({ dwell_seconds: s.dwell_seconds })} /></label>
          <label className="flex flex-col gap-2"><Label>Quiet time between offers: {s.cooldown_minutes} min</Label>
            <input type="range" min={5} max={120} step={5} value={s.cooldown_minutes} className="accent-[var(--brass)]" onChange={(e) => setS({ ...s, cooldown_minutes: Number(e.target.value) })} onPointerUp={() => patch({ cooldown_minutes: s.cooldown_minutes })} onKeyUp={() => patch({ cooldown_minutes: s.cooldown_minutes })} /></label>
        </section>
      )}
      <p className="t-callout">While this is on, glasses frames are checked for something confusing, like an error screen. Frames are never stored. Offers appear above the dock.</p>
    </div>
  );
}

// ------------------------------------------------------------------ SKL-8 Coach
export function CoachPanel({ skill }: P) {
  const toast = useToast();
  const view = useViewSource("glasses");
  const [goal, setGoal] = useState("");
  const [said, setSaid] = useState("");
  const [r, setR] = useState<CoachReply | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<CoachReply>) => {
    setBusy(true);
    try { const out = await fn(); setR(out); speak(out.spoken); } catch (e) { toast({ text: friendly(e, "Couldn't coach right now."), tone: "danger" }); }
    finally { setBusy(false); }
  };
  const send = async (t: string | null) => {
    if (!r) return;
    const v = (await view.getView()) ?? {};
    await run(() => skillsApi.coachStep(r.session.id, t, v));
    setSaid("");
  };
  const s = r?.session;
  const active = s?.status === "active";
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      {!active && (
        <>
          <Field label="What Are You Doing?">
            <input className={inputCls} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Fixing a dripping tap" onKeyDown={(e) => { if (e.key === "Enter" && goal.trim()) run(async () => skillsApi.startCoach(goal, (await view.getView()) ?? {})); }} />
          </Field>
          <Button variant="primary" className="self-start" disabled={busy || !goal.trim()} onClick={() => run(async () => skillsApi.startCoach(goal, (await view.getView()) ?? {}))}>Start Coaching</Button>
          <details className="t-callout"><summary className="min-h-11 cursor-pointer py-3">Let Cortex see the job (optional)</summary>{view.picker}</details>
        </>
      )}
      {s && (
        <section className="nested rise flex flex-col gap-4 p-5" aria-live="polite">
          <div className="flex items-center justify-between"><Label>{s.status === "done" ? "Finished" : s.status === "ended" ? "Ended" : `Step ${s.step_index + 1} of ${s.steps.length}`}</Label><Tag tone={s.mistakes ? "danger" : "muted"}>{s.mistakes} correction{s.mistakes === 1 ? "" : "s"}</Tag></div>
          {r?.mistake && <p role="alert" className="font-semibold text-danger">{r.mistake}</p>}
          <p className="t-display" style={{ fontSize: "1.5rem", lineHeight: 1.25 }}>{r?.spoken}</p>
          <ol className="flex flex-col gap-1 text-[0.9375rem]">
            {s.steps.map((t, i) => <li key={t} className={i === s.step_index && active ? "font-semibold text-brass" : i < s.step_index || s.status === "done" ? "text-text-3 line-through" : "text-text-2"}>{i + 1}. {t}</li>)}
          </ol>
          {active && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={busy} onClick={() => send("next")}>Done, Next Step</Button>
                <Button variant="secondary" disabled={busy} onClick={() => send("repeat")}>Repeat</Button>
                <Button variant="ghost" disabled={busy} onClick={() => send("back")}>Back</Button>
              </div>
              <div className="flex gap-2">
                <input className={inputCls} value={said} onChange={(e) => setSaid(e.target.value)} aria-label="Tell Cortex what happened" placeholder="Say what happened" onKeyDown={(e) => { if (e.key === "Enter" && said.trim()) send(said); }} />
                <Mic_ onText={setSaid} />
              </div>
              <Button variant="destructive" className="self-start" onClick={async () => setR({ ...r!, session: await skillsApi.endCoach(s.id), mistake: null })}>End Session</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
