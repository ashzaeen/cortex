"use client";
// Suggestion card and action loop (design.md 11.7): suggested -> approving -> done with receipt and
// undo -> settled. One brass button per view. Undo lasts until the server's undo.until (decision D17).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type Action, type Mode, type Receipt } from "@/lib/api";
import { receiptId, timecode, titleCase } from "@/lib/format";
import { modeLabel, SPRING_SNAPPY } from "./ModeDock";
import { Button, Label, ProgressRing } from "./primitives";

const VERB: Record<Action["type"], string> = {
  follow_up_email: "Approve and Send",
  flashcards: "Add to My Deck",
  reminder: "Set Reminder",
  read_aloud: "Read Aloud",
  calendar_event: "Add to Calendar",
  notes: "Save to Drive",
  message: "Approve and Text",
  caregiver_summary: "Approve and Send",
};

// One plain line under the summary: who or where it goes, so nothing leaves unseen.
function target(a: Action): string | null {
  if (a.type === "follow_up_email" && a.draft) return `TO ${a.draft.to || "NO ADDRESS YET"}`;
  if (a.type === "message" && a.message) return `TEXT ${a.message.to}`;
  if (a.type === "calendar_event" && a.event) return `${new Date(a.event.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase()}${a.event.location ? ` · ${a.event.location.toUpperCase()}` : ""}`;
  if (a.type === "reminder" && a.task?.due) return `DUE ${a.task.due}`;
  return null;
}

/** Types a mono line in (design.md 12.3: 24ms per character, capped at 400ms). Instant with reduced motion. */
function useTyped(text: string, on: boolean) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(on && !reduce ? 0 : text.length);
  useEffect(() => {
    if (!on || reduce) { setN(text.length); return; }
    setN(0);
    const per = Math.max(4, Math.min(24, 400 / Math.max(1, text.length)));
    const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x; } return x + 1; }), per);
    return () => clearInterval(t);
  }, [text, on, reduce]);
  return text.slice(0, n);
}

type Phase = { kind: "idle" } | { kind: "approving" } | { kind: "done"; receipt: Receipt; action: Action } | { kind: "undone"; receipt: Receipt } | { kind: "failed"; message: string };

type Props = {
  mode: Mode["id"];
  action: Action | null;
  sourceIds: Map<string, string>;
  loading?: boolean;
  onDone?: (a: Action) => void;
  onChanged: () => void;
};

export function SuggestionCard({ mode, action, sourceIds, loading = false, onDone, onChanged }: Props) {
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

  const receiptText = phase.kind === "done" || phase.kind === "undone"
    ? `RECEIPT ${receiptId(phase.receipt.id)} - ${timecode(phase.receipt.created_at)} - from ${phase.receipt.source_moment_ids[0] ? sourceIds.get(phase.receipt.source_moment_ids[0]) ?? "m?" : "you"}`
    : "";
  const typed = useTyped(receiptText, phase.kind === "done");

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
      await api.undoAction(phase.action.id);
      setPhase({ kind: "undone", receipt: phase.receipt });
      onChanged();
    } catch {
      setPhase({ kind: "failed", message: "Undo window closed. The receipt is in your history." });
    }
  }

  const label = `Suggested in ${modeLabel(mode)}`;
  const primaryVerb = action ? (phase.kind === "failed" ? "Retry" : VERB[action.type]) : "";

  return (
    <section id="now" aria-labelledby="sug-label" aria-busy={loading} className="sug-card glass flex min-h-[236px] flex-col gap-3 overflow-hidden p-6 md:p-7 lg:h-[272px] lg:min-h-0">
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
                {phase.kind === "done" && (
                  // The check springs in (design.md 12.3, bouncy preset: use rarely).
                  <motion.span className="inline-flex flex-none" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
                    <ProgressRing done />
                  </motion.span>
                )}
                <p className={`t-headline line-clamp-2 ${phase.kind === "done" ? "text-brass" : "text-text-2"}`}>
                  {phase.kind === "done" ? titleCase(phase.receipt.summary) : "Undone. Nothing Went Out."}
                </p>
              </div>
              <p className={`t-data truncate text-text-3 ${phase.kind === "undone" ? "line-through" : ""}`}>
                <span className="sr-only">{receiptText}</span>
                <span aria-hidden="true">{phase.kind === "done" ? typed : receiptText}</span>
              </p>
              {canUndo && (
                <div className="mt-auto flex flex-col gap-2">
                  <div><Button variant="secondary" onClick={undo}>Undo</Button></div>
                  <span aria-hidden="true" className="h-px overflow-hidden rounded-pill bg-divider">
                    {/* scaleX, not width: transform only (design.md 12.1) */}
                    <span className="block h-full origin-left bg-brass" style={{ transform: `scaleX(${left / Math.max(1, until - created)})`, transition: "transform 250ms linear" }} />
                  </span>
                </div>
              )}
              {!canUndo && action && <div className="mt-auto"><Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>Next Suggestion</Button></div>}
            </>
          ) : loading && !action ? (
            <div className="flex flex-1 flex-col gap-3" aria-hidden="true">
              <div className="skeleton shimmer h-8 w-4/5" />
              <div className="skeleton shimmer h-4 w-full" />
              <div className="skeleton shimmer mt-auto h-12 w-44 rounded-pill" />
            </div>
          ) : action ? (
            <>
              <h3 className="t-title sug-title line-clamp-2">{titleCase(action.title ?? "Suggested action")}</h3>
              {action.summary && <p className={`t-callout sug-summary ${action.type === "follow_up_email" ? "line-clamp-1" : "line-clamp-2"}`}>{action.summary}</p>}
              {target(action) && <p className="t-data sug-to truncate text-text-3">{target(action)}</p>}
              {phase.kind === "failed" && <p className="line-clamp-2 text-[0.9375rem] text-danger" role="alert">{phase.message}</p>}
              <div className="mt-auto flex flex-none flex-wrap items-center gap-2">
                {phase.kind === "approving" ? (
                  // The button morphs into a brass progress ring (design.md 11.7, 12.3).
                  <motion.span
                    layoutId="approve-btn"
                    transition={SPRING_SNAPPY}
                    style={{ borderRadius: 9999 }}
                    className="inline-flex size-12 items-center justify-center bg-brass"
                    role="status"
                  >
                    <ProgressRing tone="ink" size={26} />
                    <span className="sr-only">Working</span>
                  </motion.span>
                ) : (
                  <>
                    <motion.button
                      layoutId="approve-btn"
                      transition={SPRING_SNAPPY}
                      style={{ borderRadius: 9999 }}
                      type="button"
                      className="press press-primary inline-flex min-h-12 items-center justify-center whitespace-nowrap bg-brass px-[26px] text-[0.9375rem] font-bold text-ink hover:bg-brass-hi"
                      onClick={() => approve(action.type === "follow_up_email" || action.type === "message" ? "send" : "do")}
                    >
                      <motion.span layout="position">{primaryVerb}</motion.span>
                    </motion.button>
                    {action.type === "follow_up_email" && <Button variant="ghost" onClick={() => approve("draft")}>Save Draft</Button>}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="t-headline">Nothing to Suggest in {modeLabel(mode)} Yet</p>
              <p className="t-footnote">Suggestions appear here as Cortex hears things worth acting on.</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
