"use client";
// Demo driver for rehearsal (mock only). Hidden by default: shown with ?demo=1 or from Settings,
// so judges never see it. Steps through the Ash script.
import { Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect } from "react";
import { api, type DemoState } from "@/lib/api";
import { IconButton } from "./primitives";

export function DemoPanel({ demo, run }: { demo: DemoState; run: (fn: () => Promise<unknown>) => void }) {
  const next = demo.index < demo.total ? demo.steps[demo.index] : null;
  // Tell the chip and toast layers to stack above this bar on phones (see --driver-offset in globals.css).
  useEffect(() => {
    document.documentElement.dataset.driver = "true";
    return () => { delete document.documentElement.dataset.driver; };
  }, []);
  return (
    // Phones: above the dock, full width. Laptops: bottom-left, out of the cards' way.
    <aside
      aria-label="Demo driver"
      className="glass glass--float fixed inset-x-4 bottom-[calc(max(12px,var(--safe-bottom))+var(--dock-h)+16px)] z-[15] flex items-center gap-2 py-2 pl-4 pr-2 sm:right-auto sm:max-w-sm lg:bottom-4"
      style={{ borderRadius: "var(--r-lg)" }}
    >
      <div className="min-w-0 flex-1">
        <span className="t-label block">{demo.owner ? `${demo.owner.split(" ")[0]}'s Demo` : "Demo"} {Math.min(demo.index + 1, demo.total)} / {demo.total}</span>
        <span className="block truncate text-[0.8125rem]">{next ? `${next.beat}: ${next.you}` : "Script Done"}</span>
      </div>
      <IconButton label="Next step" onClick={() => run(api.demo.next)} disabled={!next}><SkipForward size={18} strokeWidth={1.5} /></IconButton>
      <IconButton label="Play all" onClick={() => run(api.demo.play)} disabled={!next}><Play size={18} strokeWidth={1.5} /></IconButton>
      <IconButton label="Reset" onClick={() => run(api.demo.reset)}><RotateCcw size={18} strokeWidth={1.5} /></IconButton>
    </aside>
  );
}
