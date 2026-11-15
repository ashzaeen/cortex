"use client";
// Panels for the skills that work from memory: Network, Waiting on (with overdue nudges) and Brief.
import { useEffect, useState } from "react";
import { api, type Brief } from "@/lib/api";
import { friendly } from "@/lib/errors";
import { dueChip } from "@/lib/format";
import { skillsApi, type BriefCall, type Nudge, type NudgeSettings, type PersonMatch, type SkillInfo } from "@/lib/skills-api";
import type { CortexData } from "@/lib/useCortex";
import { Button, Chip, Label, Tag } from "../primitives";
import { speak } from "../sheets";
import { useToast } from "../Toast";
import { Field, inputCls, SkillHeader } from "./common";

type P = { skill: SkillInfo | undefined; data: CortexData; refresh: () => void };

// ------------------------------------------------------------------ SKL-1 Network
export function NetworkPanel({ skill, data, onOpenPeople }: P & { onOpenPeople: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonMatch[] | null>(null);
  async function search() {
    if (!q.trim()) return;
    try { setHits((await skillsApi.searchPeople(q)).items); } catch (e) { toast({ text: friendly(e, "Couldn't search right now."), tone: "danger" }); }
  }
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      <Field label="Find Someone">
        <div className="flex gap-2">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who works at Acme? Who does ML?" onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
          <Button variant="primary" onClick={search}>Search</Button>
        </div>
      </Field>
      {hits && (hits.length === 0
        ? <p className="t-callout" role="status">I don&rsquo;t have anyone on file who matches that.</p>
        : <ul className="flex flex-col gap-2">{hits.map((h) => (
          <li key={h.person.id} className="nested rise flex items-center justify-between gap-3 p-4">
            <span><span className="t-headline block">{h.person.name}</span><span className="t-callout">{h.person.company ?? "No company yet"}</span></span>
            <Tag>{h.matched.join(", ")}</Tag>
          </li>))}</ul>)}
      <p className="t-callout">{data.people.length} {data.people.length === 1 ? "person" : "people"} on file.</p>
      <Button variant="secondary" className="self-start" onClick={onOpenPeople}>Open People</Button>
    </div>
  );
}

// ------------------------------------------------------------------ SKL-2 Waiting on
export function WaitingPanel({ skill, data, refresh, onOpenWaiting }: P & { onOpenWaiting: () => void }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<NudgeSettings | null>(null);
  const [today, setToday] = useState<Nudge[]>([]);
  const load = () => skillsApi.nudges().then((n) => setToday(n.items)).catch(() => {});
  useEffect(() => { skillsApi.nudgeSettings().then(setCfg).catch(() => {}); load(); }, []);
  const patch = async (b: Partial<NudgeSettings>) => { try { setCfg(await skillsApi.setNudgeSettings(b)); } catch (e) { toast({ text: friendly(e), tone: "danger" }); } };
  const name = (id: string) => data.people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const open = data.promises.filter((p) => p.status === "confirmed");
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      <section className="flex flex-col gap-2">
        <Label>Open Now</Label>
        {open.length === 0 && <p className="t-callout">Nothing open. Say &ldquo;I&rsquo;ll send you the deck Friday&rdquo; and it shows up here to confirm.</p>}
        <ul className="flex flex-col gap-2">
          {open.map((p) => { const c = dueChip(p); return (
            <li key={p.id} className="nested flex items-center justify-between gap-3 p-4">
              <span className="min-w-0"><span className="block">{p.direction === "waiting_on" ? `${name(p.person_id)} owes you` : `You owe ${name(p.person_id)}`}: {p.what.toLowerCase()}</span><Tag tone={c.tone}>{c.text}</Tag></span>
              <Button variant="secondary" aria-label={`Mark done: ${p.what}`} onClick={() => skillsApi.completePromise(p.id).then(refresh).catch((e) => toast({ text: friendly(e), tone: "danger" }))}>Done</Button>
            </li>); })}
        </ul>
      </section>
      {today.length > 0 && (
        <section className="flex flex-col gap-2"><Label>Nudged Today</Label>
          <ul className="flex flex-col gap-2">{today.map((n) => <li key={n.id} className="t-callout">{n.text}</li>)}</ul></section>
      )}
      {cfg && (
        <section className="nested flex flex-col gap-4 p-5">
          <label className="flex min-h-11 items-center justify-between gap-4">
            <span><span className="font-semibold">Nudge me when something is overdue</span><span className="t-callout block">Spoken and shown, once a day per promise.</span></span>
            <input type="checkbox" role="switch" className="size-6 accent-[var(--brass)]" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quiet From"><input type="time" className={inputCls} value={cfg.quiet_start} onChange={(e) => e.target.value && patch({ quiet_start: e.target.value })} /></Field>
            <Field label="Quiet Until"><input type="time" className={inputCls} value={cfg.quiet_end} onChange={(e) => e.target.value && patch({ quiet_end: e.target.value })} /></Field>
          </div>
          <label className="flex flex-col gap-2"><Label>At most {cfg.daily_cap} a day</Label>
            <input type="range" min={0} max={10} value={cfg.daily_cap} className="accent-[var(--brass)]" onChange={(e) => setCfg({ ...cfg, daily_cap: Number(e.target.value) })} onPointerUp={() => patch({ daily_cap: cfg.daily_cap })} onKeyUp={() => patch({ daily_cap: cfg.daily_cap })} /></label>
        </section>
      )}
      <Button variant="secondary" className="self-start" onClick={onOpenWaiting}>Open Waiting On</Button>
    </div>
  );
}

// ------------------------------------------------------------------ SKL-3 Brief
export function BriefPanel({ skill, data }: P) {
  const toast = useToast();
  const [who, setWho] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [call, setCall] = useState<BriefCall | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { skillsApi.autoBrief().then((s) => setAuto(s.enabled)).catch(() => {}); }, []);
  async function run(id: string) {
    setWho(id); setBusy(true); setCall(null);
    try { const b = await api.brief(id); setBrief(b); speak(b.spoken); } catch (e) { toast({ text: friendly(e, "Couldn't brief you right now."), tone: "danger" }); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-5">
      <SkillHeader skill={skill} />
      {data.people.length === 0 && <p className="t-callout">No one yet. Say &ldquo;This is Ash from Acme.&rdquo; first.</p>}
      <div role="group" aria-label="Brief me on" className="flex flex-wrap gap-2">
        {data.people.map((p) => <Chip key={p.id} selected={who === p.id} onClick={() => run(p.id)}>{p.name}</Chip>)}
      </div>
      {busy && <p className="t-callout" role="status">Briefing</p>}
      {brief && who && (
        <section className="nested rise flex flex-col gap-3 p-5" aria-live="polite">
          <Label>Brief</Label>
          <p className="t-display" style={{ fontSize: "1.5rem", lineHeight: 1.25 }}>{brief.spoken}</p>
          <ul className="flex flex-col gap-1">{brief.bullets.map((b) => <li key={b} className="t-callout">{b}</li>)}</ul>
          <span className="t-data text-text-3">FROM {brief.sources.length} MOMENT{brief.sources.length === 1 ? "" : "S"}</span>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={async () => { try { setCall(await skillsApi.briefCall(who)); } catch (e) { toast({ text: friendly(e), tone: "danger" }); } }}>Call Me With This</Button>
            {call && <Tag tone="muted">{call.status === "requested" ? "Requested. Waiting for the call line" : call.status}</Tag>}
          </div>
        </section>
      )}
      {auto !== null && (
        <label className="nested flex min-h-11 items-center justify-between gap-4 p-5">
          <span><span className="font-semibold">Brief me before meetings</span><span className="t-callout block">About 10 minutes before a calendar event that names someone you know.</span></span>
          <input type="checkbox" role="switch" className="size-6 accent-[var(--brass)]" checked={auto} onChange={(e) => { setAuto(e.target.checked); skillsApi.setAutoBrief(e.target.checked).catch(() => setAuto(!e.target.checked)); }} />
        </label>
      )}
    </div>
  );
}
