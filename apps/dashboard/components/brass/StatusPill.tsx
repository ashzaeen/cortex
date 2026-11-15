"use client";
// The privacy and capture anchor (design.md 11.1). Always visible, one tap to pause.
import { Camera, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import type { PrivacyState } from "@/lib/api";
import { Button, IconButton } from "./primitives";

type Props = {
  state: PrivacyState["state"] | "offline" | "on_call";
  modeLabel: string;
  onToggle: () => void;
  onOpenSettings: () => void;
  onCapture: () => void;
  onCall: () => void;
  links?: { label: string; onClick: () => void }[];
};

export function StatusPill({ state, modeLabel, onToggle, onOpenSettings, onCapture, onCall, links = [] }: Props) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const capturing = state === "capturing" || state === "on_call";
  const ring = state === "offline" ? "error" : state === "off_record" ? "off" : capturing ? "live" : "paused";
  // A short form for phones narrower than 360px, where the full line would collapse to "R...".
  const short =
    state === "offline" ? "OFFLINE" :
    state === "on_call" ? "CALL" :
    state === "capturing" ? "REC" :
    state === "off_record" ? "OFF REC" : "PAUSED";
  const text =
    state === "offline" ? "API OFFLINE" :
    state === "on_call" ? `ON CALL / ${modeLabel.toUpperCase()}` :
    state === "capturing" ? `REC / ${modeLabel.toUpperCase()}` :
    state === "off_record" ? "OFF THE RECORD" : "PAUSED";

  return (
    <header
      className="sticky z-10 flex-none px-4 pt-3 md:px-6 lg:px-10"
      style={{ top: 0, paddingTop: "calc(var(--safe-top) + 12px)" }}
    >
      <div className="glass glass--pill rise mx-auto flex max-w-[1280px] items-center gap-2 py-1.5 pl-2 pr-1.5" style={{ minHeight: 56 }}>
        <button
          type="button"
          onClick={onOpenSettings}
          className="press flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-pill px-2 text-left min-[360px]:gap-3 min-[360px]:px-3"
          aria-label={`Cortex, ${text.toLowerCase()}. Open settings and privacy`}
        >
          <span className="tally-ring tally-ring--ignite" data-state={ring} />
          {!compact && <span className="hidden text-lg font-bold tracking-[-0.01em] min-[420px]:inline">Cortex</span>}
          <span className="t-data truncate text-text-3" aria-live="polite"><span className="min-[360px]:hidden">{short}</span><span className="hidden min-[360px]:inline">{text}</span></span>
        </button>
        {links.length > 0 && (
          <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <button key={l.label} type="button" onClick={l.onClick} className="press min-h-11 rounded-pill px-4 text-sm text-text hover:bg-fill-soft active:bg-fill-soft">{l.label}</button>
            ))}
          </nav>
        )}
        <IconButton label="Capture with the phone camera" onClick={onCapture}><Camera size={20} strokeWidth={1.5} /></IconButton>
        <span className="relative inline-flex">
          {state === "on_call" && [0, 1, 2].map((i) => <span key={i} className="ripple-ring" aria-hidden style={{ animationDelay: `${i * 200}ms` }} />)}
          <IconButton label="Call Cortex on FaceTime" onClick={onCall}><Phone size={20} strokeWidth={1.5} /></IconButton>
        </span>
        <Button variant="secondary" className="max-[359px]:px-3" onClick={onToggle} aria-label={capturing ? "Pause capture" : "Resume capture"}>
          {capturing ? "Pause" : "Resume"}
          {!compact && <span className="-ml-1 hidden sm:inline">Capture</span>}
        </Button>
      </div>
    </header>
  );
}
