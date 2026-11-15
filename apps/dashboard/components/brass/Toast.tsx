"use client";
// Toast and undo bar (design.md 11.15): glass, above the dock, one at a time, polite announcement.
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; undo?: () => void; tone?: "plain" | "danger" };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: Omit<Toast, "id">) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), toast.undo ? 10_000 : 4_000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        // --chip-offset is set while the promise chip is showing, so the two never share a spot
        style={{ bottom: "calc(max(12px, var(--safe-bottom)) + var(--dock-h) + 16px + var(--driver-offset, 0px) + var(--chip-offset, 0px))" }}
        aria-live="polite"
      >
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="glass glass--pill glass--float pointer-events-auto flex max-w-full items-center gap-3 py-2 pl-5 pr-2"
            >
              <span className={`line-clamp-2 min-w-0 text-[0.9375rem] ${toast.tone === "danger" ? "text-danger" : "text-text"} ${toast.undo ? "" : "pr-3"}`}>{toast.text}</span>
              {toast.undo && (
                <button
                  type="button"
                  className="press min-h-11 flex-none rounded-pill border border-edge bg-fill-soft px-5 text-[0.9375rem] font-semibold hover:bg-fill-press"
                  onClick={() => { toast.undo?.(); setToast(null); }}
                >
                  Undo
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
