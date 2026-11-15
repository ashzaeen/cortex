// A full-screen state for loading, errors and 404 (design.md 11.16): calm, one line, one action.
import type { ReactNode } from "react";

export function Screen({ ring = "live", title, hint, children }: { ring?: "live" | "paused" | "error"; title: string; hint?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center" style={{ background: "var(--bg)" }}>
      <span className="tally-ring tally-ring--ignite" data-state={ring} style={{ width: 28, height: 28 }} />
      <div className="flex max-w-[26rem] flex-col gap-2">
        <h1 className="t-title">{title}</h1>
        {hint && <p className="t-callout">{hint}</p>}
      </div>
      {children}
    </main>
  );
}
