"use client";
// Timeline panel and moment rows (design.md 11.5, 11.6). Tap selects (focus pull), tap again or
// long-press opens the moment. The footer shows what you are waiting on.
import { useEffect, useRef, useState } from "react";
import { snapshotSrc, type Moment, type Person, type Promise_ } from "@/lib/api";
import { dueChip, tagFor, timecode, titleFor } from "@/lib/format";
import { Button, Frame, Label, Tag } from "./primitives";

export function MomentRow({ m, sid, tag, selected, onSelect, onOpen }: { m: Moment; sid: string; tag: string; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onPointerDown={() => { long.current = false; press.current = setTimeout(() => { long.current = true; onOpen(); }, 450); }}
      onPointerUp={() => press.current && clearTimeout(press.current)}
      onPointerLeave={() => press.current && clearTimeout(press.current)}
      onClick={() => { if (long.current) return; if (selected) { onOpen(); } else { onSelect(); } }}
      onContextMenu={(e) => e.preventDefault()}
      className={`press flex h-[60px] w-full flex-none items-center gap-3.5 rounded-[18px] px-3.5 py-2 text-left ${selected ? "bg-fill-soft" : "active:bg-fill-soft"}`}
      style={{ contentVisibility: "auto" }}
    >
      <Frame src={snapshotSrc(m.snapshot_url)} alt="" selected={selected} className="w-14" ratio="7 / 5" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[0.9375rem] font-semibold">{titleFor(m)}</span>
        <span className="t-data text-[0.6875rem] text-text-3">{timecode(m.ts)} - {sid}</span>
      </span>
      <span className="text-xs text-brass">{tag}</span>
    </button>
  );
}

type Props = {
  moments: Moment[];
  people: Person[];
  promises: Promise_[];
  ids: Map<string, string>;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
  onWaitingOn: () => void;
  max?: number;
};

const ROW = 60, GAP = 6;

export function TimelinePanel({ moments, people, promises, ids, selected, onSelect, onOpen, onSeeAll, onWaitingOn, max = 5 }: Props) {
  // Never scroll (decision D21): on laptops the panel has a fixed height, so show only the rows that
  // fit; See All opens the rest. On phones show up to `max` rows.
  const list = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(max);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const measure = () => setFit(wide.matches ? Math.max(1, Math.floor((el.clientHeight + GAP) / (ROW + GAP))) : Math.min(max, 5));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    wide.addEventListener("change", measure);
    measure();
    return () => { ro.disconnect(); wide.removeEventListener("change", measure); };
  }, [max]);
  const sorted = [...moments].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const recent = sorted.slice(0, fit);
  const hidden = sorted.length - recent.length;
  const waiting = promises.filter((p) => p.direction === "waiting_on" && p.status === "confirmed").sort((a, b) => (b.due.date ?? "").localeCompare(a.due.date ?? ""));
  const top = waiting[0];
  const who = top && people.find((p) => p.id === top.person_id);
  const chip = top && dueChip(top);
  return (
    <section id="timeline" aria-labelledby="tl-label" className="glass flex flex-col gap-1.5 overflow-hidden p-3 md:p-5 lg:h-full lg:min-h-0 lg:p-4">
      <div className="flex flex-none items-center justify-between px-3.5 py-2 lg:py-1">
        <Label as="h2" id="tl-label">Timeline</Label>
        <Button variant="ghost" className="-mr-2 min-h-11 text-[0.8125rem]" onClick={onSeeAll}>{hidden > 0 ? `See All ${sorted.length}` : "See All"}</Button>
      </div>
      {recent.length === 0 && (
        <div className="px-3.5 pb-3">
          <p className="t-headline">Nothing Captured Yet</p>
          <span className="t-label">Wear your glasses and say hi.</span>
        </div>
      )}
      <div ref={list} className="flex flex-col gap-1.5 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        {recent.map((m, i) => (
          <div key={m.id} className="rise" style={{ animationDelay: `${Math.min(i, 5) * 30}ms` }}>
            <MomentRow m={m} sid={ids.get(m.id) ?? "m?"} tag={tagFor(m, people, promises)} selected={selected === m.id} onSelect={() => onSelect(m.id)} onOpen={() => onOpen(m.id)} />
          </div>
        ))}
      </div>
      {top && (
        <button type="button" onClick={onWaitingOn} className="press mt-1.5 flex flex-none flex-wrap items-center justify-between gap-2 border-t border-edge px-3.5 pb-2 pt-3.5 text-left">
          <span className="text-sm text-text-2">Waiting On: {who?.name ?? "someone"}, {top.what.replace(/^Send /i, "").toLowerCase()}</span>
          <Tag tone={chip!.tone}>{chip!.text}</Tag>
        </button>
      )}
    </section>
  );
}
