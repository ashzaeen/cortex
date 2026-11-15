"use client";
// The light behind the glass (design.md 7). Radial gradients in one fixed layer, no live blur at rest.
// Mode shifts the weights (4.6), the selected moment's light seed moves the glint (7.3), and every
// change replays the focus pull (12.3). Scroll parallax at 0.2x; pointer tilt on desktop.
import { useEffect, useRef, useState } from "react";
import type { Mode } from "@/lib/api";
import type { LightSeed } from "@/lib/format";

const WEIGHTS: Record<Mode["id"], { green: number; brass: number; deep: number; glint: number; veil: number }> = {
  focus: { green: 1, brass: 0.8, deep: 0.85, glint: 0.7, veil: 1 },
  student: { green: 0.85, brass: 0.6, deep: 1.15, glint: 0.5, veil: 1 },
  life: { green: 0.75, brass: 1.2, deep: 0.7, glint: 0.9, veil: 1 },
  assist: { green: 1.1, brass: 0.9, deep: 0.95, glint: 0.8, veil: 0.8 },
};

const glow = (color: string) => `radial-gradient(closest-side, ${color} 0%, ${color} 35%, transparent 100%)`;

export function Ambient({ mode, seed, paused, pullKey }: { mode: Mode["id"]; seed: LightSeed; paused: boolean; pullKey: string }) {
  const w = WEIGHTS[mode];
  const ref = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState<"a" | "b">("a");
  const first = useRef(true);

  // Alternate keyframe names to replay the focus pull on every change (design.md 19.5).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setPull((p) => (p === "a" ? "b" : "a"));
  }, [pullKey]);

  // Parallax: 0.2x scroll, plus a small pointer offset on devices with hover. Transform only.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let px = 0, py = 0, raf = 0;
    const apply = () => { raf = 0; el.style.transform = `translate3d(${px}px, ${py - Math.min(window.scrollY * 0.2, 80)}px, 0)`; /* capped so long pages stay lit */ };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = (e.clientX / window.innerWidth - 0.5) * -12;
      py = (e.clientY / window.innerHeight - 0.5) * -8;
      queue();
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("scroll", queue); window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  // Light shapes from design.md 7.1, scaled to the viewport, nudged by the seed (max ~80px of travel).
  const shapes = [
    { color: "var(--amb-green)", w: "70vmax", h: "80vmax", left: "-12%", top: "-18%", o: w.green, dx: (seed.deep - 0.5) * 60, dy: 0 },
    { color: "var(--amb-brass)", w: `${58 + seed.brass * 14}vmax`, h: `${40 + seed.brass * 10}vmax`, left: "48%", top: "4%", o: w.brass * (0.75 + seed.brass * 0.35), dx: 0, dy: (seed.brass - 0.5) * 60 },
    { color: "var(--amb-deep)", w: "90vmax", h: "50vmax", left: "10%", top: "62%", o: w.deep * (0.8 + seed.deep * 0.3), dx: (seed.deep - 0.5) * -50, dy: 0 },
    { color: "var(--amb-glint)", w: "22vmax", h: "22vmax", left: `${seed.glintX * 100 - 11}%`, top: `${seed.glintY * 100 - 11}%`, o: w.glint * 0.55, dx: 0, dy: 0 },
  ];

  return (
    <div className="ambient" aria-hidden="true" data-paused={paused}>
      <div ref={ref} className="absolute inset-0" style={{ willChange: "transform" }}>
        <div className="ambient__scene" data-pull={pullKey ? pull : undefined} key={pull}>
          <div className="ambient__drift">
            {shapes.map((s, i) => (
              <div
                key={i}
                className="ambient__light"
                style={{ width: s.w, height: s.h, left: s.left, top: s.top, background: glow(s.color), opacity: Math.min(1, s.o), transform: `translate3d(${s.dx}px, ${s.dy}px, 0)` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="ambient__veil" style={{ opacity: w.veil }} />
    </div>
  );
}
