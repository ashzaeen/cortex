"use client";
// Ask surface + answer and proof (design.md 11.3, 11.4). Fixed-height tile that never scrolls
// (decision D21): the question is one line, the quote scales to the space it has (max three lines),
// and the proof is one compact row. The full moment is one tap away.
import { Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { snapshotSrc, type AskAnswer, type Moment } from "@/lib/api";
import { curly, timecode } from "@/lib/format";
import { Frame, IconButton, Label } from "./primitives";

export const sourceLabel = (m: Moment) =>
  ({ glasses: m.transcript ? "glasses mic" : "glasses camera", phone: "phone", call: "FaceTime call", seed: "earlier capture", dashboard: "typed" })[m.source];

/** Compact, single-row proof (design.md 11.4 item 3): label, one line of note, framed thumbnail. */
export function ProofRow({ m, sid, note, onOpen }: { m: Moment; sid: string; note?: string; onOpen?: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="nested press flex h-[64px] w-full flex-none items-center gap-3 px-4 text-left" style={{ borderRadius: "var(--r-lg)" }}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="t-data truncate text-brass">PROOF {sid} - {timecode(m.ts)} - {sourceLabel(m).toUpperCase()}</span>
        <span className="t-footnote truncate">{note ?? m.caption ?? (m.place ? `At ${m.place}` : "Open the moment for details.")}</span>
      </div>
      <Frame src={snapshotSrc(m.snapshot_url)} alt={m.caption ?? "Captured frame"} selected className="w-[60px]" ratio="16 / 10" />
    </button>
  );
}

/** Proof card used by the styleguide and moment detail (unclamped). */
export function ProofCard({ m, sid, note }: { m: Moment; sid: string; note?: string }) {
  return (
    <div className="nested flex gap-4 p-5" style={{ borderRadius: "var(--r-lg)" }}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="t-data text-brass">PROOF {sid} - {timecode(m.ts)}</span>
        <blockquote className={m.transcript ? "t-proof" : "text-[0.9375rem] text-text-2"}>{m.transcript ? curly(m.transcript) : m.caption ?? "Snapshot saved."}</blockquote>
        {(note || m.caption) && <p className="t-footnote">{note ?? m.caption}</p>}
      </div>
      {m.snapshot_url && <Frame src={snapshotSrc(m.snapshot_url)} alt={m.caption ?? "Captured frame"} selected className="hidden w-24 self-start sm:block" ratio="16 / 10" />}
    </div>
  );
}

type Props = {
  question: string;
  answer: AskAnswer | null;
  thinking: boolean;
  searched: number;
  proof: Moment | null;
  ids: Map<string, string>;
  onOpenAsk: () => void;
  onOpenMoment: (id: string) => void;
};

export function AskPanel({ question, answer, thinking, searched, proof, ids, onOpenAsk, onOpenMoment }: Props) {
  // The hero quote: the answer's lead source when Cortex answered, otherwise the selected moment.
  const lead = answer?.grounded ? answer.sources[0] : proof ?? undefined;
  const hero = lead ? (lead.transcript ? curly(lead.transcript) : lead.caption ?? "Snapshot saved.") : null;
  const note = answer?.grounded && lead && answer.sources[0]?.id === lead.id
    ? answer.answer + (answer.sources.length > 1 ? ` Also in ${answer.sources.length - 1} more.` : "")
    : undefined;

  return (
    <section id="ask" aria-labelledby="ask-label" className="glass flex h-full flex-col gap-3 overflow-hidden p-6 md:p-7">
      <Label as="h2" id="ask-label" className="flex-none">Ask Your Memory</Label>
      <div className="flex flex-none items-center gap-3">
        <button type="button" onClick={onOpenAsk} className={`press min-h-11 min-w-0 flex-1 rounded-md text-left ${thinking ? "shimmer shimmer-once" : ""}`}>
          <span className="t-question block truncate">{question}</span>
        </button>
        <IconButton label="Ask by voice or text" onClick={onOpenAsk}><Mic size={20} strokeWidth={1.5} /></IconButton>
      </div>

      {/* The quote area takes whatever height is left; the type scales to it (container units). */}
      <div aria-live="polite" className="ask-quote-area relative min-h-0 flex-1">
        {thinking ? (
          <div className="flex h-full flex-col justify-center gap-3">
            <div className="skeleton shimmer h-[22cqh] max-h-10 w-11/12" />
            <div className="skeleton shimmer h-[22cqh] max-h-10 w-2/3" />
            <span className="t-label">Searching {searched} Moments</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={answer?.receipt_id ?? lead?.id ?? "empty"}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-full flex-col justify-center"
            >
              {answer && !answer.grounded ? (
                <>
                  <p className="t-headline">No Match for That</p>
                  <p className="t-footnote">Try a person or a day.</p>
                </>
              ) : hero ? (
                <blockquote
                  className={`ask-quote ${lead?.transcript ? "font-voice italic" : "font-ui text-text-2"}`}
                  style={{
                    fontSize: "clamp(1rem, 24cqh, 2.5rem)", lineHeight: 1.25, letterSpacing: "-0.01em",
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textWrap: "balance",
                  }}
                >
                  {hero}
                </blockquote>
              ) : (
                <>
                  <p className="t-headline">Nothing Captured Yet</p>
                  <span className="t-label">Wear your glasses and say hi.</span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {!thinking && lead && !(answer && !answer.grounded) && (
        <ProofRow m={lead} sid={ids.get(lead.id) ?? "m?"} note={note} onOpen={() => onOpenMoment(lead.id)} />
      )}
    </section>
  );
}
