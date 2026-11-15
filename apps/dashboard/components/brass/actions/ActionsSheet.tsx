"use client";
// Actions history (ACT-3, ACT-12, design.md 10.1 "Receipts history"): every proposal and what became of it,
// filterable by status. Matte, because it is a reading surface. Waiting items can be skipped here; anything
// still inside its undo window can be undone.
import { useEffect, useMemo, useState } from "react";
import type { Action, Receipt } from "@/lib/api";
import { receiptId, titleCase } from "@/lib/format";
import { Button, Chip, Tag } from "../primitives";
import { Sheet } from "../Sheet";
import { isOpen, STATUS_LABEL, target } from "./meta";

type Filter = "all" | "waiting" | "done" | "skipped" | "undone" | "failed";
const FILTERS: { id: Filter; label: string; match: (a: Action) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "waiting", label: "Waiting", match: (a) => a.status === "proposed" },
  { id: "done", label: "Done", match: (a) => a.status === "done" || a.status === "sent" || a.status === "draft_saved" },
  { id: "skipped", label: "Skipped", match: (a) => a.status === "dismissed" },
  { id: "undone", label: "Undone", match: (a) => a.status === "undone" },
  { id: "failed", label: "Failed", match: (a) => a.status === "failed" },
];
const TONE: Record<Action["status"], "brass" | "muted" | "danger" | "ok"> = {
  proposed: "brass", sent: "ok", draft_saved: "ok", done: "ok", undone: "muted", dismissed: "muted", failed: "danger",
};
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

type Props = {
  open: boolean;
  onClose: () => void;
  actions: Action[];
  receipts: Receipt[];
  ids: Map<string, string>;
  onOpenMoment: (id: string) => void;
  onSkip: (a: Action) => void;
  onUndo: (r: Receipt) => void;
};

export function ActionsSheet({ open, onClose, actions, receipts, ids, onOpenMoment, onSkip, onUndo }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [, tick] = useState(0);

  // The newest receipt for each action says when it last changed and whether undo is still open.
  const latest = useMemo(() => {
    const m = new Map<string, Receipt>();
    for (const r of receipts) if (r.action_id && (!m.has(r.action_id) || Date.parse(r.created_at) > Date.parse(m.get(r.action_id)!.created_at))) m.set(r.action_id, r);
    return m;
  }, [receipts]);
  const left = (a: Action) => {
    const r = latest.get(a.id);
    return r?.undo.available && r.undo.until ? Date.parse(r.undo.until) - Date.now() : 0;
  };
  const anyLive = actions.some((a) => left(a) > 0);
  useEffect(() => {
    if (!open || !anyLive) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open, anyLive]);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    const when = (a: Action) => (latest.get(a.id) ? Date.parse(latest.get(a.id)!.created_at) : Infinity); // waiting first
    return actions.filter(f.match).sort((a, b) => when(b) - when(a));
  }, [actions, filter, latest]);
  const counts = (f: (typeof FILTERS)[number]) => actions.filter(f.match).length;

  return (
    <Sheet open={open} onClose={onClose} label="Actions" title="Actions" detent="full" matte>
      <div className="flex flex-col gap-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by status">
          {FILTERS.filter((f) => f.id === "all" || counts(f) > 0 || f.id === filter).map((f) => (
            <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} {f.id === "all" ? actions.length : counts(f)}</Chip>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="t-callout">{actions.length === 0 ? "No actions yet. Cortex suggests them as it hears things worth doing." : "Nothing here."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((a) => {
              const r = latest.get(a.id);
              const remaining = left(a);
              const t = target(a);
              return (
                <li key={a.id} className="nested flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[0.9375rem] font-medium">{titleCase(a.title ?? a.type.replace(/_/g, " "))}</p>
                    <span className="flex flex-none items-center gap-1.5">
                      {a.auto && <Tag tone="muted">Auto</Tag>}
                      <Tag tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Tag>
                    </span>
                  </div>
                  {a.summary && <p className="text-[0.9375rem] text-text-2">{a.summary}</p>}
                  {t && <p className="t-data truncate text-text-3">{t}</p>}
                  {r && <p className={`t-data text-text-3 ${a.status === "undone" || a.status === "dismissed" ? "line-through" : ""}`}>RECEIPT {receiptId(r.id)}{a.source_moment_ids[0] ? ` - from ${ids.get(a.source_moment_ids[0]) ?? "m?"}` : ""}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {a.source_moment_ids[0] && <Button variant="ghost" onClick={() => onOpenMoment(a.source_moment_ids[0])}>Open the Moment</Button>}
                    {isOpen(a) && <Button variant="ghost" onClick={() => onSkip(a)}>Skip</Button>}
                    {remaining > 0 && r && (
                      <>
                        <Button variant="secondary" onClick={() => onUndo(r)}>Undo</Button>
                        <span className="t-data text-text-3" aria-hidden="true">{mmss(remaining)} LEFT</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="t-footnote">Approve a waiting suggestion from its card on Home. Nothing runs until you do.</p>
      </div>
    </Sheet>
  );
}
