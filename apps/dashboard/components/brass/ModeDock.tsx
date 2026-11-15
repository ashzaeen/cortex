"use client";
// The mode dock (design.md 11.2): the signature control. Brass indicator springs between segments.
import { motion } from "motion/react";
import type { Mode } from "@/lib/api";

export const MODE_ORDER: Mode["id"][] = ["focus", "student", "life", "assist"];
export const MODE_LABEL: Record<Mode["id"], string> = { focus: "Focus", student: "Student", life: "Life", assist: "Assist" };
export const SPRING_SNAPPY = { type: "spring", stiffness: 380, damping: 30, mass: 1 } as const;

export function ModeDock({ active, onChange }: { active: Mode["id"]; onChange: (m: Mode["id"]) => void }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = MODE_ORDER.indexOf(active);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onChange(MODE_ORDER[(i + 1) % 4]); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onChange(MODE_ORDER[(i + 3) % 4]); }
  };
  return (
    <nav
      className="fixed inset-x-0 z-20 flex justify-center px-4"
      style={{ bottom: "max(12px, var(--safe-bottom))" }}
      aria-label="Mode"
    >
      <div role="radiogroup" aria-label="Mode" onKeyDown={onKey} className="dock glass glass--pill glass--float rise flex w-full max-w-[26rem] gap-1 p-2 sm:w-auto sm:max-w-none sm:gap-1.5" style={{ animationDelay: "520ms" }}>
        {MODE_ORDER.map((m) => {
          const on = m === active;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(m)}
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
              <span className="relative">{MODE_LABEL[m]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
