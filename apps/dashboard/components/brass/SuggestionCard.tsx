"use client";
// Suggestion card and action loop (design.md 11.7): suggested -> approving -> done with receipt and
// undo -> settled. One brass button per view. Undo lasts until the server's undo.until (decision D17).
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type Action, type Mode, type Receipt } from "@/lib/api";
import { receiptId, timecode, titleCase } from "@/lib/format";
import { MODE_LABEL } from "./ModeDock";
import { Button, Label, ProgressRing } from "./primitives";

const VERB: Record<Action["type"], string> = {
  follow_up_email: "Approve and Send",
  flashcards: "Add to My Deck",
  reminder: "Set Reminder",
  read_aloud: "Read Aloud",
  calendar_event: "Add to Calendar",
  notes: "Save to Drive",
  message: "Approve and Text",
};

// One plain line under the summary: who or where it goes, so nothing leaves unseen.
function target(a: Action): string | null {
  if (a.type === "follow_up_email" && a.draft) return `TO ${a.draft.to || "NO ADDRESS YET"}`;
  if (a.type === "message" && a.message) return `TEXT ${a.message.to}`;
  if (a.type === "calendar_event" && a.event) return `${new Date(a.event.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase()}${a.event.location ? ` · ${a.event.location.toUpperCase()}` : ""}`;
  if (a.type === "reminder" && a.task?.due) return `DUE ${a.task.due}`;
  return null;
}

type Phase = { kind: "idle" } | { kind: "approving" } | { kind: "done"; receipt: Receipt; action: Action } | { kind: "undone"; receipt: Receipt } | { kind: "failed"; message: string };

type Props = {
  mode: Mode["id"];
  action: Action | null;
  sourceIds: Map<string, string>;
  onDone?: (a: Action) => void;
  onChanged: () => void;
};

export function SuggestionCard({ mode, action, sourceIds, onDone, onChanged }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());

  // A mode switch starts fresh; a new suggestion in the same mode keeps the last receipt on screen.
  useEffect(() => { setPhase({ kind: "idle" }); }, [mode]);

  const until = phase.kind === "done" && phase.receipt.undo.until ? Date.parse(phase.receipt.undo.until) : 0;
  const created = phase.kind === "done" ? Date.parse(phase.receipt.created_at) : 0;
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [until]);
  const left = until ? Math.max(0, until - now) : 0;
  const canUndo = phase.kind === "done" && phase.receipt.undo.available && left > 0;

  async function approve(deliver: "send" | "draft" | "do") {
    if (!action) return;
    setPhase({ kind: "approving" });
    try {
      const [res] = await Promise.all([api.confirmAction(action.id, deliver), new Promise((r) => setTimeout(r, 600))]);
      setPhase({ kind: "done", receipt: res.receipt, action: res.action });
      onDone?.(res.action);
      onChanged();
    } catch (e) {
      setPhase({ kind: "failed", message: e instanceof Error && /reach/i.test(e.message) ? "Couldn't reach Cortex. Nothing was changed." : "Couldn't do that. Nothing was changed." });
    }
  }

  async function undo() {
    if (phase.kind !== "done") return;
    try {
      const res = await api.undoAction(phase.action.id);
      setPhase({ kind: "undone", receipt: phase.receipt });
      void res;
      onChanged();
    } catch {
      setPhase({ kind: "failed", message: "Undo window closed. The receipt is in your history." });
    }
  }

  const label = `Suggested in ${MODE_LABEL[mode]}`;
  const from = (r: Receipt) => (r.source_moment_ids[0] ? sourceIds.get(r.source_moment_ids[0]) ?? "m?" : "you");

  return (
    <section id="now" aria-labelledby="sug-label" className="glass sug-card flex h-[272px] flex-col gap-3 overflow-hidden p-6 md:p-7">
      <Label as="h2" id="sug-label" className="flex-none">{label}</Label>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase.kind === "idle" || phase.kind === "approving" || phase.kind === "failed" ? `s-${action?.id ?? "none"}` : `r-${phase.kind}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.16 } }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          {(phase.kind === "done" || phase.kind === "undone") ? (
            <>
              <div className="flex items-center gap-3">
                {phase.kind === "done" && <ProgressRing done />}
                <p className={`t-headline line-clamp-2 ${phase.kind === "done" ? "text-brass" : "text-text-2"}`}>
                  {phase.kind === "done" ? titleCase(phase.receipt.summary) : "Undone. Nothing Went Out."}
                </p>
              </div>
              <p className={`t-data truncate text-text-3 ${phase.kind === "undone" ? "line-through" : ""}`}>
                RECEIPT {receiptId(phase.receipt.id)} - {timecode(phase.receipt.created_at)} - from {from(phase.receipt)}
              </p>
              {canUndo && (
                <div className="mt-auto flex flex-col gap-2">
                  <div><Button variant="secondary" onClick={undo}>Undo</Button></div>
                  <span aria-hidden="true" className="h-px overflow-hidden rounded-pill bg-divider">
                    <span className="block h-full bg-brass" style={{ width: `${(left / Math.max(1, until - created)) * 100}%`, transition: "width 250ms linear" }} />
                  </span>
                </div>
              )}
              {!canUndo && action && <div className="mt-auto"><Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>Next Suggestion</Button></div>}
            </>
          ) : action ? (
            <>
              <h3 className="t-title sug-title line-clamp-2">{titleCase(action.title ?? "Suggested action")}</h3>
              {action.summary && <p className={`t-callout sug-summary ${action.type === "follow_up_email" ? "line-clamp-1" : "line-clamp-2"}`}>{action.summary}</p>}
              {target(action) && <p className="t-data sug-to truncate text-text-3">{target(action)}</p>}
              {phase.kind === "failed" && <p className="line-clamp-1 text-[0.9375rem] text-danger" role="alert">{phase.message}</p>}
              <div className="mt-auto flex flex-none items-center gap-2">
                {phase.kind === "approving" ? (
                  <span className="inline-flex min-h-12 items-center gap-3 px-2" aria-live="polite">
                    <ProgressRing /> <span className="t-label">Working</span>
                  </span>
                ) : (
                  <>
                    <Button variant="primary" onClick={() => approve(action.type === "follow_up_email" || action.type === "message" ? "send" : "do")}>
                      {phase.kind === "failed" ? "Retry" : VERB[action.type]}
                    </Button>
                    {action.type === "follow_up_email" && <Button variant="ghost" onClick={() => approve("draft")}>Save Draft</Button>}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="t-headline">Nothing to Suggest in {MODE_LABEL[mode]} Yet</p>
              <p className="t-footnote">Suggestions appear here as Cortex hears things worth acting on.</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
