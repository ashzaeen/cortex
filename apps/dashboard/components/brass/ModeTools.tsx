"use client";
// The mode tools rail (design.md 11.2b). Laptop (1024px and up): a column on the left of the page.
// Phone and tablet: a tab on the left edge that slides a panel out. The tools change with the mode.
// A tap does one of four things (lib/modeTools.ts): open a sheet, ask a preset question, open the
// capture sheet with a preset, or draft something from the latest moment.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell, BookOpen, CalendarClock, CalendarPlus, Camera, Clock, Eye, FileText, Gavel, GraduationCap, HandCoins,
  HeartHandshake, History, Hourglass, Info, Layers, ListChecks, MessageSquare, Newspaper, PanelLeftOpen, Presentation,
  Receipt, Repeat, ScanSearch, ScanText, Search, Send, Settings2, ShoppingBasket, Timer, TriangleAlert, Users, Volume2, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toolsFor, type Tool } from "@/lib/modeTools";
import { modeLabel } from "./ModeDock";
import { Label } from "./primitives";

const ICONS: Record<string, LucideIcon> = {
  Bell, BookOpen, CalendarClock, CalendarPlus, Camera, Clock, Eye, FileText, Gavel, GraduationCap, HandCoins,
  HeartHandshake, History, Hourglass, Info, Layers, ListChecks, MessageSquare, Newspaper, Presentation,
  Receipt, Repeat, ScanSearch, ScanText, Search, Send, ShoppingBasket, Timer, TriangleAlert, Users, Volume2, Wallet,
};

function ToolButton({ tool, onPick }: { tool: Tool; onPick: (t: Tool) => void }) {
  const Icon = ICONS[tool.icon] ?? FileText;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(tool)}
        title={tool.hint}
        className="press group flex min-h-11 w-full items-center gap-3 rounded-pill px-3 text-left text-[0.9375rem] font-medium text-text hover:bg-fill-soft active:bg-fill-press"
      >
        <Icon size={18} strokeWidth={1.5} className="flex-none text-brass" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{tool.label}</span>
      </button>
    </li>
  );
}

function ToolList({ mode, modes, onPick, onSettings }: { mode: string; modes: { id: string; name: string }[]; onPick: (t: Tool) => void; onSettings: () => void }) {
  const tools = toolsFor(mode);
  return (
    <>
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <Label as="h2">{modeLabel(mode, modes)} Tools</Label>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label={`${modeLabel(mode, modes)} tools`}>
        {tools.map((t) => <ToolButton key={t.id} tool={t} onPick={onPick} />)}
      </ul>
      <button
        type="button"
        onClick={onSettings}
        className="press mt-2 flex min-h-11 w-full flex-none items-center gap-3 rounded-pill border-t border-edge px-3 text-left text-[0.8125rem] font-medium text-text-2 hover:bg-fill-soft"
      >
        <Settings2 size={16} strokeWidth={1.5} aria-hidden="true" /> {modeLabel(mode, modes)} Settings
      </button>
    </>
  );
}

type Props = { mode: string; modes: { id: string; name: string }[]; onPick: (t: Tool) => void; onSettings: () => void };

/** Laptop: the left column. Hidden below 1024px, where the edge tab takes over. */
export function ModeToolsRail(props: Props) {
  return (
    <aside aria-label="Mode tools" className="glass hidden min-h-0 flex-col rounded-xl p-3 lg:flex lg:h-full">
      <ToolList {...props} />
    </aside>
  );
}

/** Phone and tablet: a tab on the left edge opens a slide-out panel. It is a tap target, not a swipe,
 *  so the iOS back-swipe from the screen edge is left alone (design.md 9.4). */
export function ModeToolsEdge(props: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const tab = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); tab.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const pick = (t: Tool) => { setOpen(false); props.onPick(t); };

  return (
    <div className="lg:hidden">
      <button
        ref={tab}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${modeLabel(props.mode, props.modes)} tools`}
        aria-expanded={open}
        className="press glass fixed left-0 top-1/2 z-[22] flex h-14 w-9 -translate-y-1/2 items-center justify-center rounded-r-pill"
      >
        <PanelLeftOpen size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-[40] bg-black/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={close}
              aria-hidden="true"
            />
            <motion.aside
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label={`${modeLabel(props.mode, props.modes)} tools`}
              className="matte fixed inset-y-0 left-0 z-[41] flex w-[min(20rem,86vw)] flex-col p-3"
              style={{ borderRadius: "0 var(--r-xl) var(--r-xl) 0", boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)", paddingTop: "max(12px, var(--safe-top, 0px))", paddingBottom: "max(12px, var(--safe-bottom))" }}
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="mb-1 flex justify-end">
                <button type="button" onClick={close} aria-label="Close tools" className="press inline-flex size-11 items-center justify-center rounded-pill hover:bg-fill-soft">
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <ToolList mode={props.mode} modes={props.modes} onPick={pick} onSettings={() => { setOpen(false); props.onSettings(); }} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
