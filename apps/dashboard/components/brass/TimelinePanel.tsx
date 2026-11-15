"use client";
// Timeline panel and moment rows (design.md 11.5, 11.6). Tap selects (focus pull), tap again or
// long-press opens the moment. The footer shows what you are waiting on.
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { snapshotSrc, type Moment, type Person, type Promise_ } from "@/lib/api";
import { dueChip, tagFor, timecode, titleFor } from "@/lib/format";
import { Button, Frame, Label, Tag } from "./primitives";

const REVEAL = 96; // px of the Delete action revealed by a left swipe (design.md 11.5)

/** One moment. Tap selects, long-press opens, swipe left reveals Delete (undo toast, never a dialog). */
export function MomentRow({ m, sid, tag, selected, onSelect, onOpen, onDelete }: { m: Moment; sid: string; tag: string; selected: boolean; onSelect: () => void; onOpen: () => void; onDelete?: () => void }) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const claimed = useRef(false); // this gesture is a row swipe, so the page's mode swipe must not also fire
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-REVEAL, -REVEAL / 3, 0], [1, 0.4, 0]); // invisible until the row slides
  const reduce = useReducedMotion();
  const settle = (to: number) => {
    setOpen(to !== 0);
    animate(x, to, reduce ? { duration: 0.16 } : { type: "spring", stiffness: 380, damping: 30 });
  };
  const cancelPress = () => { if (press.current) clearTimeout(press.current); };

  return (
    <div className="relative overflow-hidden rounded-[18px]">
      {onDelete && (
        <motion.button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          onClick={() => { settle(0); onDelete(); }}
          className="press absolute inset-y-0 right-0 flex items-center justify-center rounded-pill text-[0.9375rem] font-semibold text-danger"
          style={{ opacity: deleteOpacity, pointerEvents: open ? "auto" : "none", width: REVEAL - 8, margin: "4px 4px 4px 0", background: "var(--fill-soft)", border: "1px solid var(--edge)" }}
        >
          Delete
        </motion.button>
      )}
      <motion.button
        type="button"
        aria-pressed={selected}
        style={{ x, contentVisibility: "auto", touchAction: "pan-y" }}
        drag={onDelete ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.12, right: 0 }}
        dragMomentum={false}
        onDragEnd={(_, info) => settle(info.offset.x + (open ? -REVEAL : 0) < -REVEAL / 2 || info.velocity.x < -500 ? -REVEAL : 0)}
        onPointerDown={(e) => {
          long.current = false;
          claimed.current = false;
          origin.current = { x: e.clientX, y: e.clientY };
          cancelPress();
          press.current = setTimeout(() => { long.current = true; onOpen(); }, 450);
        }}
        onPointerMove={(e) => {
          const o = origin.current;
          if (o && (Math.abs(e.clientX - o.x) > 6 || Math.abs(e.clientY - o.y) > 6)) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onTouchEnd={(e) => {
          // A leftward row swipe belongs to the row; keep it from also changing the mode.
          const t = e.changedTouches[0], o = origin.current;
          if (onDelete && o && t.clientX - o.x < -24 && Math.abs(t.clientX - o.x) > Math.abs(t.clientY - o.y)) { claimed.current = true; e.stopPropagation(); }
        }}
        onClick={() => {
          if (long.current || claimed.current) return;
          if (open) { settle(0); return; }
          if (selected) { onOpen(); } else { onSelect(); }
        }}
        onKeyDown={(e) => { if (onDelete && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); onDelete(); } }}
        onContextMenu={(e) => e.preventDefault()}
        className={`press flex h-[60px] w-full flex-none items-center gap-3.5 rounded-[18px] px-3.5 py-2 text-left ${selected ? "bg-fill-soft" : "active:bg-fill-soft"}`}
      >
        <Frame src={snapshotSrc(m.snapshot_url)} alt="" selected={selected} className="w-14" ratio="7 / 5" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[0.9375rem] font-semibold">{titleFor(m)}</span>
          <span className="t-data text-[0.6875rem] text-text-3">{timecode(m.ts)} - {sid}</span>
        </span>
        <span className="text-xs text-brass">{tag}</span>
      </motion.button>
    </div>
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
  onDelete?: (m: Moment) => void;
  onSeeAll: () => void;
  onWaitingOn: () => void;
  max?: number;
};

const ROW = 60, GAP = 6;

export function TimelinePanel({ moments, people, promises, ids, selected, onSelect, onOpen, onDelete, onSeeAll, onWaitingOn, max = 5 }: Props) {
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
            <MomentRow m={m} sid={ids.get(m.id) ?? "m?"} tag={tagFor(m, people, promises)} selected={selected === m.id} onSelect={() => onSelect(m.id)} onOpen={() => onOpen(m.id)} onDelete={onDelete && (() => onDelete(m))} />
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
