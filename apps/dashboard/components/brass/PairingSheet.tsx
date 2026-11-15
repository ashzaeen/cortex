"use client";
// Pairing and onboarding, minimal for the hackathon (design.md D13): three steps and the 3D glasses.
// The 3D chunk is lazy and gated: no WebGL, reduced motion or low memory get a flat fallback.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Label } from "./primitives";
import { Sheet } from "./Sheet";

const Glasses3D = dynamic(() => import("./Glasses3D"), { ssr: false, loading: () => <Flat /> });

function Flat() {
  return (
    <div className="flex size-full items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 240 90" className="w-3/4">
        <path d="M10 22h96l-6 44a12 12 0 0 1-12 10H30a12 12 0 0 1-12-10Z M134 22h96l-8 44a12 12 0 0 1-12 10h-58a12 12 0 0 1-12-10Z" fill="var(--amb-deep)" stroke="var(--text-3)" strokeWidth="3" />
        <path d="M106 30q14-10 28 0" fill="none" stroke="var(--text-3)" strokeWidth="3" />
        <circle cx="14" cy="18" r="4" fill="var(--brass)" />
      </svg>
    </div>
  );
}

function can3D() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem < 4) return false;
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

const STEPS = [
  { t: "Turn On Developer Mode", d: "In the Meta AI app, open Settings, App Info, then tap the app version five times." },
  { t: "Open the Cortex iOS App", d: "It connects to your glasses and shows the capture state." },
  { t: "Say “Remember This”", d: "Your first moment appears on the timeline within a few seconds." },
];

export function PairingSheet({ open, onClose, live }: { open: boolean; onClose: () => void; live: boolean }) {
  const [threeD, setThreeD] = useState(false);
  useEffect(() => { if (open) setThreeD(can3D()); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} label="Pair Glasses" title="Pair Glasses" detent="full">
      <div className="flex flex-col gap-6">
        <div className="nested h-[220px] overflow-hidden">{open && (threeD ? <Glasses3D live={live} /> : <Flat />)}</div>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-4">
              <span className="t-data flex size-8 flex-none items-center justify-center rounded-pill border border-brass text-brass">{i + 1}</span>
              <div><p className="t-headline">{s.t}</p><p className="t-callout">{s.d}</p></div>
            </li>
          ))}
        </ol>
        <Label>Glasses capture needs the iOS app (#36). Until then, use the phone camera.</Label>
      </div>
    </Sheet>
  );
}
