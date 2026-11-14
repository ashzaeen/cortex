"use client";
import { useState } from "react";
import { useCortex } from "@/lib/useCortex";
import { AskTab, LiveTab, PrivacyTab, ReceiptsTab, TimelineTab } from "@/components/tabs";

const TABS = ["Live", "Timeline", "Ask", "Receipts", "Privacy"] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const { data, feed, connected, error, refresh } = useCortex();
  const [tab, setTab] = useState<Tab>("Live");
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setActionError(null);
      await fn();
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That did not work.");
    }
  };

  const capture = data.privacy?.state ?? "unknown";
  const captureColor = capture === "capturing" ? "bg-green-500" : capture === "paused" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <h1 className="text-lg font-semibold">Cortex</h1>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <i className={`inline-block h-2 w-2 rounded-full ${captureColor}`} />
            {capture.replace("_", " ")}
          </span>
          <span>{connected ? "live" : "offline"}</span>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        {(error || actionError) && (
          <p className="mb-4 rounded-lg border border-red-500/40 p-3 text-sm text-red-600 dark:text-red-400">{actionError ?? error}</p>
        )}
        {tab === "Live" && <LiveTab data={data} feed={feed} run={run} />}
        {tab === "Timeline" && <TimelineTab data={data} run={run} />}
        {tab === "Ask" && <AskTab data={data} run={run} />}
        {tab === "Receipts" && <ReceiptsTab data={data} run={run} />}
        {tab === "Privacy" && <PrivacyTab data={data} run={run} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 border-t border-line bg-card"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-h-14 text-xs font-medium ${tab === t ? "text-accent" : "text-muted"}`}
              aria-current={tab === t ? "page" : undefined}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
