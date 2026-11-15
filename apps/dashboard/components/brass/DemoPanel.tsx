"use client";
// Demo driver for rehearsal (mock only). Hidden by default: shown with ?demo=1 or from Settings,
// so judges never see it. Steps through the Ash script.
import { Play, RotateCcw, SkipForward } from "lucide-react";
import { api, type DemoState } from "@/lib/api";
import { IconButton } from "./primitives";

export function DemoPanel({ demo, run }: { demo: DemoState; run: (fn: () => Promise<unknown>) => void }) {
  const next = demo.index < demo.total ? demo.steps[demo.index] : null;
  return (
    <aside aria-label="Demo driver" className="glass glass--float fixed left-4 z-40 flex max-w-[calc(100%-2rem)] items-center gap-2 py-2 pl-4 pr-2 sm:max-w-sm" style={{ top: "calc(var(--safe-top) + 84px)", borderRadius: "var(--r-lg)" }}>
      <div className="min-w-0 flex-1">
        <span className="t-label block">Demo {Math.min(demo.index + 1, demo.total)} / {demo.total}</span>
        <span className="block truncate text-[0.8125rem]">{next ? `${next.beat}: ${next.you}` : "Script Done"}</span>
      </div>
      <IconButton label="Next step" onClick={() => run(api.demo.next)} disabled={!next}><SkipForward size={18} strokeWidth={1.5} /></IconButton>
      <IconButton label="Play all" onClick={() => run(api.demo.play)} disabled={!next}><Play size={18} strokeWidth={1.5} /></IconButton>
      <IconButton label="Reset" onClick={() => run(api.demo.reset)}><RotateCcw size={18} strokeWidth={1.5} /></IconButton>
    </aside>
  );
}
