"use client";
// Bottom sheet (design.md 11.14): glass over a dim backdrop, drag handle, detents, velocity snapping.
// The sheet follows the finger from the handle; content scrolls inside. Escape and the dim close it.
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, Label } from "./primitives";

const SPRING_GENTLE = { type: "spring", stiffness: 220, damping: 26, mass: 1 } as const;
const DETENTS = { peek: 0.3, half: 0.6, full: 0.92 } as const;
export type Detent = keyof typeof DETENTS;

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  title?: ReactNode;
  detent?: Detent;
  children: ReactNode;
  matte?: boolean;
};

export function Sheet({ open, onClose, label, title, detent = "full", children, matte = false }: Props) {
  const drag = useDragControls();
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [at, setAt] = useState<Detent>(detent);
  const [vh, setVh] = useState(800);

  useEffect(() => {
    if (!open) return;
    setAt(detent);
    opener.current = document.activeElement;
    const measure = () => setVh(window.visualViewport?.height ?? window.innerHeight);
    measure();
    window.visualViewport?.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        // Keep focus inside the sheet (design.md 17).
        const items = panel.current.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true }), 120);
    document.documentElement.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.visualViewport?.removeEventListener("resize", measure);
      document.documentElement.style.overflow = "";
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open, detent, onClose]);

  const height = Math.round(vh * DETENTS.full);
  const offsetFor = (d: Detent) => height - Math.round(vh * DETENTS[d]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const y = offsetFor(at) + info.offset.y;
    if (info.velocity.y > 600 || y > height - vh * DETENTS.peek * 0.7) return onClose();
    if (info.velocity.y < -600) return setAt("full");
    const nearest = (Object.keys(DETENTS) as Detent[]).reduce((a, b) => (Math.abs(offsetFor(b) - y) < Math.abs(offsetFor(a) - y) ? b : a));
    setAt(nearest);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-30" role="presentation">
          <motion.div
            className="absolute inset-0"
            style={{ background: "var(--dim)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`${matte ? "matte rounded-b-none" : "glass glass--sheet"} absolute inset-x-0 bottom-0 mx-auto flex max-w-[720px] flex-col`}
            style={{ height, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: "var(--r-sheet)", borderTopRightRadius: "var(--r-sheet)", overscrollBehavior: "contain" }}
            initial={{ y: height }}
            animate={{ y: offsetFor(at) }}
            exit={{ y: height, transition: reduce ? { duration: 0.16 } : { duration: 0.24, ease: [0.7, 0, 0.84, 0] } }}
            transition={reduce ? { duration: 0.16 } : SPRING_GENTLE}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: height }}
            dragElastic={{ top: 0.08, bottom: 0.4 }}
            onDragEnd={onDragEnd}
          >
            <div
              className="flex flex-none cursor-grab touch-none flex-col items-center gap-3 px-5 pb-2 pt-2.5 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)}
            >
              <span aria-hidden="true" className="h-[5px] w-9 rounded-pill bg-edge" />
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0">{typeof title === "string" ? <Label as="h2">{title}</Label> : title}</div>
                <IconButton label="Close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
                  <X size={20} strokeWidth={1.5} />
                </IconButton>
              </div>
            </div>
            <motion.div
              className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 md:px-6"
              style={{ paddingBottom: "calc(var(--safe-bottom) + 24px)", overscrollBehavior: "contain" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.2 } }}
            >
              {children}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
