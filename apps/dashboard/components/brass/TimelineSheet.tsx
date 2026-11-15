"use client";
// Full timeline (design.md 11.6, 13.1 #2): a 3D contact-sheet film strip. Frames sit on a gentle arc,
// the centered frame faces you, neighbors rotate away (up to 28 degrees) and dim. Drag or use the
// scrubber to move through the day like film; the room's light follows the centered moment.
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { snapshotSrc, type Moment, type Person, type Promise_ } from "@/lib/api";
import { curly, dayLabel, tagFor, timecode, titleFor, type Tag } from "@/lib/format";
import { Button, Chip, Frame, Label } from "./primitives";
import { Sheet } from "./Sheet";

const FILTERS: (Tag | "All")[] = ["All", "Network", "Waiting On", "Snapshot", "Call"];
const SPACING = 200; // wider than a frame (190px), so neighbours peek out instead of covering each other
const DRAG_SLOP = 6; // px of movement before a press becomes a drag

type Props = {
  open: boolean; onClose: () => void; moments: Moment[]; people: Person[]; promises: Promise_[];
  ids: Map<string, string>; selected: string | null; onSelect: (id: string) => void; onOpen: (id: string) => void;
};

export function TimelineSheet({ open, onClose, moments, people, promises, ids, selected, onSelect, onOpen }: Props) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const list = useMemo(() => [...moments]
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .filter((m) => filter === "All" || tagFor(m, people, promises) === filter), [moments, people, promises, filter]);
  const startIdx = Math.max(0, list.findIndex((m) => m.id === selected));
  const [pos, setPos] = useState(startIdx); // continuous position while dragging
  const drag = useRef<{ x: number; p: number; active: boolean } | null>(null);
  const moved = useRef(false); // the last press was a drag, so the click that follows must not open a moment
  const idx = Math.min(list.length - 1, Math.max(0, Math.round(pos)));
  const cur = list[idx];

  useEffect(() => { if (open) setPos(Math.max(0, list.findIndex((m) => m.id === selected))); }, [open, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  // Selecting a moment replays the room's focus pull, so wait until the scrub settles instead of
  // firing it on every frame the strip passes.
  useEffect(() => {
    if (!open || !cur) return;
    const t = setTimeout(() => { if (cur.id !== selected) onSelect(cur.id); }, 450);
    return () => clearTimeout(t);
  }, [idx, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, p: pos, active: false }; moved.current = false; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.x) < DRAG_SLOP) return;
      d.active = true; moved.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setPos(Math.min(list.length - 1, Math.max(0, d.p - (e.clientX - d.x) / SPACING)));
  };
  const onUp = () => { drag.current = null; setPos((p) => Math.round(p)); }; // also the range input's release: always settle on a whole frame

  return (
    <Sheet open={open} onClose={onClose} label="Timeline" title="Timeline" detent="full">
      <div className="flex flex-col gap-5">
        <div className="fade-end -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pr-8">
          {FILTERS.map((f) => <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}
        </div>

        {list.length === 0 ? (
          <p className="t-callout">No moments with that tag.</p>
        ) : (
          <>
            <div
              className="relative h-[220px] touch-pan-y select-none overflow-hidden"
              style={{ perspective: "1200px" }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              role="listbox" aria-label="Moments" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "ArrowRight") setPos((p) => Math.min(list.length - 1, Math.round(p) + 1)); if (e.key === "ArrowLeft") setPos((p) => Math.max(0, Math.round(p) - 1)); if (e.key === "Enter" && cur) onOpen(cur.id); }}
            >
              {list.map((m, i) => {
                const d = i - pos;
                if (Math.abs(d) > 4) return null;
                const rot = reduce ? 0 : Math.max(-28, Math.min(28, -d * 18));
                const z = reduce ? 0 : -Math.abs(d) * 90;
                return (
                  <button
                    key={m.id} type="button" role="option" aria-selected={i === idx} tabIndex={-1}
                    onClick={() => { if (moved.current) return; if (i === idx) onOpen(m.id); else setPos(i); }}
                    className="absolute left-1/2 top-2 w-[190px]"
                    style={{
                      transform: `translateX(calc(-50% + ${d * SPACING}px)) translateZ(${z}px) rotateY(${rot}deg)`,
                      opacity: 1 - Math.min(0.6, Math.abs(d) * 0.22),
                      transition: drag.current?.active ? "none" : "transform 480ms var(--ease-out), opacity 480ms var(--ease-out)",
                      zIndex: 10 - Math.round(Math.abs(d)),
                    }}
                  >
                    <Frame src={snapshotSrc(m.snapshot_url)} alt={m.caption ?? titleFor(m)} selected={i === idx} className="w-full" ratio="16 / 10" />
                    <span className="t-data mt-2 block text-center text-brass">{timecode(m.ts)}</span>
                    <span className="mt-0.5 block truncate text-center text-[0.8125rem] text-text-2" style={{ opacity: i === idx ? 1 : 0, transition: "opacity 280ms var(--ease-out)" }}>{titleFor(m)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="scrub" className="sr-only">Scrub through the day</label>
              <input
                id="scrub" type="range" min={0} max={Math.max(0, list.length - 1)} step={0.01} value={pos}
                onChange={(e) => setPos(Number(e.target.value))} onPointerUp={onUp} onKeyUp={onUp}
                className="w-full accent-[var(--brass)]"
                aria-valuetext={cur ? `${dayLabel(cur.ts)} ${timecode(cur.ts)}` : undefined}
              />
              <div className="flex justify-between">
                <span className="t-data text-text-3">{list[0] && `${dayLabel(list[0].ts).toUpperCase()} ${timecode(list[0].ts)}`}</span>
                <span className="t-data text-brass" aria-live="polite">{cur && `${ids.get(cur.id) ?? "m?"} - ${timecode(cur.ts)}`}</span>
                <span className="t-data text-text-3">{list.at(-1) && timecode(list.at(-1)!.ts)}</span>
              </div>
            </div>

            {cur && (
              <div className="nested flex flex-col gap-3 p-5">
                <Label>{dayLabel(cur.ts)} - {tagFor(cur, people, promises)}</Label>
                <p className={cur.transcript ? "t-proof" : "t-callout"}>{cur.transcript ? curly(cur.transcript) : cur.caption}</p>
                <div><Button variant="secondary" onClick={() => onOpen(cur.id)}>Open Moment</Button></div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
