"use client";
// The pre-meeting brief card (design.md 11.9): readable in a few seconds. Order is what the wearer needs first:
// the headline, what is open (overdue first), what was said last time (a real quote with its source), and one
// sentence to open the conversation. The three bullets and the spoken version stay available but out of the way.
import { Check, Copy, Volume2 } from "lucide-react";
import { useState } from "react";
import type { Brief } from "@/lib/api";
import { curly } from "@/lib/format";
import { Button, Label, Tag } from "./primitives";
import { speak } from "./sheets";

export type BriefOpenItem = {
  promise_id: string; text: string; direction: "waiting_on" | "i_owe"; due_date: string | null; due_text: string | null;
  overdue: boolean; days_overdue: number; source_moment_id: string;
};
export type BriefLastTime = { when: string; where: string | null; gist: string; quote: string | null; moment_id: string };
export type BriefFull = Brief & { headline?: string; last_time?: BriefLastTime | null; opener?: string | null; open?: BriefOpenItem[] };

function dueTag(i: BriefOpenItem): { text: string; tone: "danger" | "brass" | "muted" } {
  if (i.overdue) return { text: `OVERDUE ${i.days_overdue}D`, tone: "danger" };
  if (!i.due_date) return { text: i.due_text ? `DUE ${i.due_text.toUpperCase()}` : "NO DATE", tone: "muted" };
  const hours = (new Date(`${i.due_date}T23:59:59`).getTime() - Date.now()) / 36e5;
  const day = new Date(`${i.due_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  return { text: hours <= 24 ? "DUE TODAY" : `DUE ${day}`, tone: hours <= 48 ? "brass" : "muted" };
}

export function BriefCard({ brief, onOpenMoment, children }: { brief: BriefFull; onOpenMoment?: (id: string) => void; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [more, setMore] = useState(false);
  const open = brief.open ?? [];
  const last = brief.last_time;
  async function copy() {
    if (!brief.opener) return;
    try { await navigator.clipboard.writeText(brief.opener); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }
  return (
    <section className="rise flex flex-col gap-4" aria-label={`Brief on ${brief.person.name}`}>
      <h4 className="t-headline" style={{ fontFamily: "var(--font-display, inherit)" }}>{brief.headline || brief.person.name}</h4>

      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{open.some((i) => i.overdue) ? "Open - Overdue First" : "Open"}</Label>
          <ul className="flex flex-col gap-2">
            {open.map((i) => { const t = dueTag(i); return (
              <li key={i.promise_id} className="nested flex items-start justify-between gap-3 p-3">
                <button type="button" className="press min-h-9 text-left text-[0.9375rem]" onClick={() => onOpenMoment?.(i.source_moment_id)}>{i.text}</button>
                <Tag tone={t.tone}>{t.text}</Tag>
              </li>); })}
          </ul>
        </div>
      )}

      {last && (
        <div className="flex flex-col gap-2">
          <Label>Last Time</Label>
          <p className="t-callout">{last.gist}</p>
          {last.quote && (
            <blockquote className="t-display border-l-2 border-brass pl-4" style={{ fontSize: "1.25rem", lineHeight: 1.3, fontStyle: "italic" }}>{curly(last.quote)}</blockquote>
          )}
          <button type="button" className="press t-data min-h-9 self-start text-brass" onClick={() => onOpenMoment?.(last.moment_id)}>
            {last.when.toUpperCase()}{last.where && !last.when.toLowerCase().includes(last.where.toLowerCase()) ? ` - ${last.where.toUpperCase()}` : ""}
          </button>
        </div>
      )}

      {brief.opener && (
        <div className="nested flex flex-col gap-2 p-4">
          <Label>You Could Say</Label>
          <p className="text-[1rem] font-semibold">{curly(brief.opener)}</p>
          <Button variant="ghost" className="self-start" onClick={copy} aria-live="polite">
            {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}{copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => speak(brief.spoken)}><Volume2 aria-hidden="true" size={16} />Play Brief</Button>
        <Button variant="ghost" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "Less" : "More"}</Button>
        {children}
      </div>
      {more && (
        <div className="rise flex flex-col gap-2">
          <ul className="flex flex-col gap-1">{brief.bullets.map((b) => <li key={b} className="t-callout">{b}</li>)}</ul>
          <span className="t-data text-text-3">FROM {brief.sources.length} MOMENT{brief.sources.length === 1 ? "" : "S"}</span>
        </div>
      )}
    </section>
  );
}
