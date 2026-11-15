"use client";
// Sheets (design.md 11.14, 8.4). Phones: a bottom sheet with a drag handle, detents and velocity snapping,
// lifted above the keyboard. Tablet and laptop (768px and up): a centered panel that scales in.
// Several sheets can be open at once (a moment opened from the timeline): the newest is on top, and only it
// answers Escape and Tab.
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton, Label } from "./primitives";

const SPRING_GENTLE = { type: "spring", stiffness: 220, damping: 26, mass: 1 } as const;
const DETENTS = { peek: 0.3, half: 0.6, full: 0.92 } as const;
export type Detent = keyof typeof DETENTS;

// Open sheets, bottom to top. The page scroll stays locked until the last one closes.
const stack: string[] = [];
function lockScroll(on: boolean) {
  const v = on ? "hidden" : "";
  document.documentElement.style.overflow = v;
  document.body.style.overflow = v;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

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
  const id = useId();
  const drag = useDragControls();
  const reduce = useReducedMotion();
  const wide = useWide();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  const [at, setAt] = useState<Detent>(detent);
  const [depth, setDepth] = useState(0);
  // The visible area: the iOS keyboard shrinks the visual viewport, and the sheet follows it (design.md 9.3).
  const [vv, setVv] = useState({ top: 0, height: 800 });
  // A short window (landscape phone) or an open keyboard leaves too little room for a half sheet: use the full detent.
  const [squeezed, setSqueezed] = useState(false);

  // Always call the latest onClose without re-running the open effect: Home re-renders on every live
  // update, and re-running it would reset the detent and steal focus from the field being typed in.
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    setAt(detent);
    opener.current = document.activeElement;
    stack.push(id);
    setDepth(stack.length - 1);
    if (stack.length === 1) lockScroll(true);

    const v = window.visualViewport;
    const measure = () => {
      const h = Math.round(v?.height ?? window.innerHeight);
      setVv({ top: Math.round(v?.offsetTop ?? 0), height: h });
      setSqueezed(h < 500 || h < window.innerHeight - 120);
    };
    measure();
    v?.addEventListener("resize", measure);
    v?.addEventListener("scroll", measure);

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return; // a sheet above this one owns the keyboard
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panel.current) {
        // Keep focus inside the sheet (design.md 17).
        const items = panel.current.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);

    // Focus the field the sheet is for (marked data-autofocus), otherwise the sheet itself, so a screen
    // reader announces its title and Tab starts at the top instead of on Close.
    const t = setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
      target?.focus({ preventScroll: true });
    }, 120);

    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      v?.removeEventListener("resize", measure);
      v?.removeEventListener("scroll", measure);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) lockScroll(false);
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open, detent, id]);

  const eff: Detent = squeezed ? "full" : at;
  const height = Math.round(vv.height * DETENTS.full);
  const offsetFor = (d: Detent) => height - Math.round(vv.height * DETENTS[d]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const y = offsetFor(eff) + info.offset.y;
    if (info.velocity.y > 600 || y > height - vv.height * DETENTS.peek * 0.7) return closeRef.current();
    if (info.velocity.y < -600) return setAt("full");
    const nearest = (Object.keys(DETENTS) as Detent[]).reduce((a, b) => (Math.abs(offsetFor(b) - y) < Math.abs(offsetFor(a) - y) ? b : a));
    setAt(nearest);
  };

  const heading = typeof title === "string" ? <Label as="h2">{title}</Label> : title;
  const closeButton = (
    <IconButton label="Close" onClick={() => closeRef.current()} onPointerDown={(e) => e.stopPropagation()}>
      <X size={20} strokeWidth={1.5} />
    </IconButton>
  );
  const body = (padding: string, extra: string) => (
    <motion.div
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${padding}`}
      style={{ paddingBottom: extra }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0" style={{ top: vv.top, height: vv.height, zIndex: 30 + depth }} role="presentation">
          <motion.div
            className="absolute inset-0 touch-none"
            style={{ background: "var(--dim)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => closeRef.current()}
            aria-hidden="true"
          />

          {wide ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <motion.div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                className={`${matte ? "matte" : "glass"} pointer-events-auto flex w-full max-w-[640px] flex-col outline-none`}
                style={{ maxHeight: Math.max(240, vv.height - 48), boxShadow: "0 24px 60px rgba(0, 0, 0, 0.4)" }}
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.18 } }}
                transition={reduce ? { duration: 0.16 } : SPRING_GENTLE}
              >
                <div className="flex flex-none items-center justify-between gap-3 px-6 pb-2 pt-5">
                  <div className="min-w-0">{heading}</div>
                  {closeButton}
                </div>
                {body("px-6 pt-1", "24px")}
              </motion.div>
            </div>
          ) : (
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className={`${matte ? "matte" : "glass glass--sheet"} absolute inset-x-0 bottom-0 mx-auto flex flex-col outline-none`}
              // The panel is always full height and slides down to its detent; padding the bottom by that offset
              // keeps the scroller inside the visible part, so the last item is always reachable.
              style={{ height, paddingBottom: offsetFor(eff), borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: "var(--r-sheet)", borderTopRightRadius: "var(--r-sheet)", overscrollBehavior: "contain" }}
              initial={{ y: height }}
              animate={{ y: offsetFor(eff) }}
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
                  <div className="min-w-0">{heading}</div>
                  {closeButton}
                </div>
              </div>
              {body("px-5 pt-1", "calc(var(--safe-bottom) + 24px)")}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
