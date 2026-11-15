"use client";
// "Cortex thinks this is a lecture" (MODE-2): a chip above the dock with Switch and Not now.
// It never switches on its own; the person confirms (or says yes to the glasses).
import { AnimatePresence, motion } from "motion/react";
import type { ModeSuggestion } from "@/lib/api";
import { modeLabel } from "./ModeDock";

export function ModeChip({ suggestion, modes, slot, onSwitch, onDismiss }: {
  suggestion: ModeSuggestion | null; modes: { id: string; name: string }[]; slot: number; onSwitch: (id: string) => void; onDismiss: () => void;
}) {
  const label = suggestion ? modeLabel(suggestion.mode_id, modes) : "";
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[25] flex justify-center px-4"
      style={{ bottom: `calc(max(12px, var(--safe-bottom)) + var(--dock-h) + 16px + var(--driver-offset, 0px) + ${slot * 64}px)` }}>
      <AnimatePresence>
        {suggestion && (
          <motion.div
            key={suggestion.mode_id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="glass glass--pill glass--float pointer-events-auto flex max-w-full items-center gap-2 py-2 pl-5 pr-2"
            role="status"
          >
            <span className="min-w-0 text-[0.9375rem]">{suggestion.reason} Switch to {label}?</span>
            <button type="button" className="press min-h-11 flex-none rounded-pill px-4 text-[0.9375rem] font-medium text-text-2 hover:bg-fill-soft" onClick={onDismiss}>Not Now</button>
            <button type="button" className="press min-h-11 flex-none rounded-pill bg-brass px-5 text-[0.9375rem] font-bold text-ink hover:bg-brass-hi" onClick={() => onSwitch(suggestion.mode_id)}>Switch</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
