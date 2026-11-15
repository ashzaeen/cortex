"use client";
// The mode dock (design.md 11.2): the signature control. Brass indicator springs between segments.
import { motion } from "motion/react";
import type { Mode } from "@/lib/api";

export const MODE_ORDER: Mode["id"][] = ["focus", "student", "life", "assist"];
export const MODE_LABEL: Record<string, string> = { focus: "Focus", student: "Student", life: "Life", assist: "Assist" };
/** The label for any mode id, including a custom mode this list has not heard of. */
export const modeLabel = (id: string, modes?: Pick<Mode, "id" | "name">[]) =>
  MODE_LABEL[id] ?? modes?.find((m) => m.id === id)?.name ?? id.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
export const SPRING_SNAPPY = { type: "spring", stiffness: 380, damping: 30, mass: 1 } as const;

/** The four built-in modes, then any custom ones (MODE-7). Tapping the segment that is already active opens
 *  that mode's settings (DASH-10). */
export function ModeDock({ active, modes = [], onChange, onActiveTap }: { active: Mode["id"]; modes?: Pick<Mode, "id" | "name">[]; onChange: (m: Mode["id"]) => void; onActiveTap?: () => void }) {
  const order = [...MODE_ORDER, ...modes.map((m) => m.id).filter((id) => !MODE_ORDER.includes(id))];
  const onKey = (e: React.KeyboardEvent) => {
    const i = Math.max(0, order.indexOf(active));
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onChange(order[(i + 1) % order.length]); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onChange(order[(i + order.length - 1) % order.length]); }
  };
  return (
    <nav
      className="fixed inset-x-0 z-20 flex justify-center px-4"
      style={{ bottom: "max(12px, var(--safe-bottom))" }}
      aria-label="Mode"
    >
      <div role="radiogroup" aria-label="Mode" onKeyDown={onKey} className="dock glass glass--pill glass--float rise flex w-full max-w-[26rem] gap-1 p-2 sm:w-auto sm:max-w-none sm:gap-1.5" style={{ animationDelay: "520ms" }}>
        {order.map((m) => {
          const on = m === active;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => (on && onActiveTap ? onActiveTap() : onChange(m))}
              className={`dock-seg press relative min-h-12 min-w-0 flex-1 rounded-pill px-1 text-sm font-semibold min-[360px]:text-[0.9375rem] sm:min-w-[76px] sm:flex-none sm:px-[26px] ${on ? "text-ink" : "text-text hover:bg-fill-soft active:bg-fill-press"}`}
            >
              {on && (
                <motion.span
                  layoutId="mode-indicator"
                  transition={SPRING_SNAPPY}
                  className="absolute inset-0 rounded-pill bg-brass"
                  aria-hidden="true"
                />
              )}
              <span className="relative">{modeLabel(m, modes)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
