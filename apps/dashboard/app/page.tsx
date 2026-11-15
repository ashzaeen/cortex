"use client";
// Home (design.md 10, decision D1): one vertical flow - status pill, ask and proof, suggestion,
// timeline - with the mode dock and everything else as sheets.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type AskAnswer, type Mode, type Moment, type Person, type Promise_, type Receipt } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { lightSeed, shortIds } from "@/lib/format";
import { useCortex } from "@/lib/useCortex";
import { Ambient } from "@/components/brass/Ambient";
import { AskPanel } from "@/components/brass/AskPanel";
import { CaptureSheet } from "@/components/brass/CaptureSheet";
import { DemoPanel } from "@/components/brass/DemoPanel";
import { MODE_LABEL, MODE_ORDER, ModeDock } from "@/components/brass/ModeDock";
import { PairingSheet } from "@/components/brass/PairingSheet";
import { AskSheet, CallSheet, MomentSheet, PeopleSheet, ReceiptsSheet, SettingsSheet, speak, WaitingOnSheet } from "@/components/brass/sheets";
import { StatusPill } from "@/components/brass/StatusPill";
import { SuggestionCard } from "@/components/brass/SuggestionCard";
import { TimelinePanel } from "@/components/brass/TimelinePanel";
import { TimelineSheet } from "@/components/brass/TimelineSheet";
import { ToastProvider, useToast } from "@/components/brass/Toast";

type SheetId = "ask" | "timeline" | "people" | "waiting" | "settings" | "receipts" | "call" | "capture" | "pairing";
const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const write = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* storage blocked */ } };

export default function Page() {
  return <ToastProvider><Home /></ToastProvider>;
}

function Home() {
  const { data, feed, connected, error, refresh } = useCortex();
  const toast = useToast();
  const [modeLocal, setModeLocal] = useState<Mode["id"] | null>(null);
  const mode: Mode["id"] = modeLocal ?? data.modes.find((m) => m.active)?.id ?? "focus";
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("What did Ash promise me?");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [thinking, setThinking] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [personFocus, setPersonFocus] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());
  const [solid, setSolid] = useState(false);
  const [demoOn, setDemoOn] = useState(false);

  useEffect(() => {
    setSolid(read("cortex.solid"));
    setDemoOn(isDemo() || read("cortex.demo") || new URLSearchParams(location.search).get("demo") === "1");
  }, []);
  useEffect(() => { document.documentElement.dataset.solid = String(solid); }, [solid]);

  const moments = useMemo(() => data.moments.filter((m) => !pendingDelete.has(m.id)), [data.moments, pendingDelete]);
  const ids = useMemo(() => shortIds(data.moments), [data.moments]);
  const newest = useMemo(() => [...moments].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0], [moments]);
  const sel = moments.find((m) => m.id === selected) ?? null;
  // Follow new captures live, unless the person picked a moment.
  const autoFollow = useRef(true);
  useEffect(() => { if (autoFollow.current && newest) setSelected(newest.id); }, [newest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = useMemo(() => {
    const last = feed.find((f) => f.type === "call.started" || f.type === "call.ended");
    return last?.type === "call.started" ? { startedAt: Date.parse(last.at) } : null;
  }, [feed]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); } catch (e) { toast({ text: e instanceof Error ? e.message : "That didn't work.", tone: "danger" }); }
  }, [refresh, toast]);

  // ---------- modes
  const changeMode = useCallback((m: Mode["id"]) => {
    if (m === mode) return;
    setModeLocal(m);
    api.activateMode(m).then(() => refresh()).catch(() => { /* stays local if the API has no modes yet */ });
  }, [mode, refresh]);
  useEffect(() => { if (modeLocal && data.modes.find((x) => x.active)?.id === modeLocal) setModeLocal(null); }, [data.modes, modeLocal]);

  // ---------- ask
  const ask = useCallback(async (q: string) => {
    setQuestion(q); setThinking(true); setRecent((r) => [q, ...r.filter((x) => x !== q)].slice(0, 4));
    try {
      const [a] = await Promise.all([api.ask(q), new Promise((r) => setTimeout(r, 600))]);
      setAnswer(a);
      if (a.sources[0]) { autoFollow.current = false; setSelected(a.sources[0].id); }
      speak(a.spoken);
      refresh();
    } catch (e) { toast({ text: e instanceof Error ? e.message : "Couldn't ask right now.", tone: "danger" }); }
    finally { setThinking(false); }
  }, [refresh, toast]);

  // ---------- privacy
  const privacy = data.privacy?.state ?? "capturing";
  const togglePause = () => run(() => api.setPrivacy(privacy === "capturing" ? "paused" : "capturing"));

  // ---------- delete with undo (design.md 11.5: undo, never a confirm dialog)
  const deleteMoment = (m: Moment) => {
    setMomentId(null);
    setPendingDelete((s) => new Set(s).add(m.id));
    const timer = setTimeout(() => {
      api.deleteMoment(m.id).then(refresh).finally(() => setPendingDelete((s) => { const n = new Set(s); n.delete(m.id); return n; }));
    }, 6000);
    toast({ text: "Moment Deleted", undo: () => { clearTimeout(timer); setPendingDelete((s) => { const n = new Set(s); n.delete(m.id); return n; }); } });
  };

  // ---------- suggestion for the current mode
  const suggestion = useMemo(() => {
    const open = data.actions.filter((a) => a.status === "proposed" && (a.mode ?? (a.type === "follow_up_email" ? "focus" : null)) === mode);
    return open.at(-1) ?? null;
  }, [data.actions, mode]);

  // ---------- keyboard (design.md 17): 1-4 modes, / ask, P pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (/^[1-4]$/.test(e.key)) changeMode(MODE_ORDER[Number(e.key) - 1]);
      if (e.key === "/") { e.preventDefault(); setSheet("ask"); }
      if (e.key.toLowerCase() === "p") togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- horizontal swipe to change mode (D8); ignores the iOS back-swipe edge
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipe.current = t.clientX > 24 ? { x: t.clientX, y: t.clientY } : null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current; swipe.current = null; if (!s) return;
    const t = e.changedTouches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = MODE_ORDER.indexOf(mode);
    changeMode(MODE_ORDER[(i + (dx < 0 ? 1 : 3)) % 4]);
  };

  const pillState = !connected && error ? "offline" : call ? "on_call" : privacy;
  const proof = sel ?? null;

  return (
    <>
      <Ambient mode={mode} seed={lightSeed(sel?.ts)} paused={privacy !== "capturing"} pullKey={`${mode}:${selected ?? ""}`} />
      <div className="relative z-[1] min-h-dvh lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <StatusPill
            state={pillState}
            modeLabel={MODE_LABEL[mode]}
            onToggle={togglePause}
            onOpenSettings={() => setSheet("settings")}
            onCapture={() => setSheet("capture")}
            onCall={() => setSheet("call")}
            links={[
              { label: "People", onClick: () => { setPersonFocus(null); setSheet("people"); } },
              { label: "Waiting On", onClick: () => setSheet("waiting") },
              { label: "Receipts", onClick: () => setSheet("receipts") },
            ]}
          />

        <main
          className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] items-start gap-4 px-4 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6 md:px-6 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-5 lg:px-10 lg:pt-5"
          style={{ paddingBottom: "calc(var(--dock-h) + max(12px, var(--safe-bottom)) + 32px)" }}
        >
          <div className="rise min-w-0 lg:h-full lg:min-h-0" style={{ animationDelay: "350ms" }}>
            <TimelinePanel max={20}
              moments={moments} people={data.people} promises={data.promises} ids={ids} selected={selected}
              onSelect={(id) => { autoFollow.current = false; setSelected(id); }}
              onOpen={(id) => setMomentId(id)}
              onSeeAll={() => setSheet("timeline")}
              onWaitingOn={() => setSheet("waiting")}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:h-full lg:min-h-0 lg:gap-5">
            <div className="rise flex-none" style={{ animationDelay: "390ms" }}>
              <SuggestionCard
                mode={mode}
                action={suggestion}
                sourceIds={ids}
                onChanged={refresh}
                onDone={(a) => {
                  if (a.type !== "read_aloud") return;
                  const m = data.moments.find((x) => x.id === a.source_moment_ids[0]);
                  if (m) speak(m.caption ?? m.transcript ?? "");
                }}
              />
            </div>
            <div className="rise h-[400px] lg:h-auto lg:min-h-0 lg:flex-1" style={{ animationDelay: "430ms" }}>
              <AskPanel question={question} answer={answer} thinking={thinking} searched={moments.length} proof={proof} ids={ids} onOpenAsk={() => setSheet("ask")} onOpenMoment={(id) => setMomentId(id)} />
            </div>
            <div className="rise flex flex-wrap gap-2 lg:hidden" style={{ animationDelay: "470ms" }}>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => { setPersonFocus(null); setSheet("people"); }}>People</button>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => setSheet("waiting")}>Waiting On</button>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => setSheet("receipts")}>Receipts</button>
            </div>
          </div>
        </main>

        <ModeDock active={mode} onChange={changeMode} />
      </div>

      {demoOn && data.demo && <DemoPanel demo={data.demo} run={run} />}

      <AskSheet open={sheet === "ask"} onClose={() => setSheet(null)} onAsk={ask} recent={recent} />
      <MomentSheet m={data.moments.find((m) => m.id === momentId) ?? null} sid={momentId ? ids.get(momentId) ?? "m?" : ""} people={data.people} onClose={() => setMomentId(null)} onDelete={deleteMoment} />
      <TimelineSheet open={sheet === "timeline"} onClose={() => setSheet(null)} moments={moments} people={data.people} promises={data.promises} ids={ids} selected={selected}
        onSelect={(id) => { autoFollow.current = false; setSelected(id); }} onOpen={(id) => setMomentId(id)} />
      <PeopleSheet open={sheet === "people"} onClose={() => setSheet(null)} data={data} focusId={personFocus}
        onEmail={(p: Person) => run(async () => { await api.proposeEmail(p.id); setSheet(null); changeMode("focus"); toast({ text: `Follow-Up to ${p.name.split(" ")[0]} Is Ready to Approve` }); })} />
      <WaitingOnSheet open={sheet === "waiting"} onClose={() => setSheet(null)} data={data}
        onOpenMoment={(id) => setMomentId(id)} onConfirm={(p: Promise_) => run(() => api.confirmPromise(p.id))} />
      <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} privacy={privacy}
        onPrivacy={(s) => run(() => api.setPrivacy(s))}
        solid={solid} onSolid={(v) => { setSolid(v); write("cortex.solid", v); }}
        demo={demoOn} onDemo={(v) => { setDemoOn(v); write("cortex.demo", v); }}
        onPairing={() => setSheet("pairing")} onReceipts={() => setSheet("receipts")} onPeople={() => setSheet("people")} />
      <ReceiptsSheet open={sheet === "receipts"} onClose={() => setSheet(null)} receipts={data.receipts} ids={ids}
        onUndo={(r: Receipt) => r.action_id && run(() => api.undoAction(r.action_id!))} />
      <CallSheet open={sheet === "call"} onClose={() => setSheet(null)} call={call} moments={data.moments} />
      <CaptureSheet open={sheet === "capture"} onClose={() => setSheet(null)} privacy={privacy} onSaved={(t) => { toast({ text: t }); refresh(); autoFollow.current = true; }} />
      <PairingSheet open={sheet === "pairing"} onClose={() => setSheet(null)} live={privacy === "capturing"} />

      {/* Proposed promises surface as a confirm chip right above the dock (T0-4 one-tap confirm). */}
      <PromiseChip promises={data.promises} people={data.people} onConfirm={(p) => run(() => api.confirmPromise(p.id))} />
    </>
  );
}

function PromiseChip({ promises, people, onConfirm }: { promises: Promise_[]; people: Person[]; onConfirm: (p: Promise_) => void }) {
  const p = promises.filter((x) => x.status === "proposed").at(-1);
  if (!p) return null;
  const who = people.find((x) => x.id === p.person_id)?.name.split(" ")[0] ?? "Someone";
  return (
    <div className="fixed inset-x-0 z-[25] flex justify-center px-4" style={{ bottom: "calc(max(12px, var(--safe-bottom)) + var(--dock-h) + 16px)" }}>
      <div className="glass glass--pill glass--float rise flex items-center gap-3 py-2 pl-5 pr-2" role="status">
        <span className="tally-ring" />
        <span className="text-[0.9375rem]">{who} will {p.what.toLowerCase()}{p.due.text ? ` by ${p.due.text}` : ""}</span>
        <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-5 text-[0.9375rem] font-semibold" onClick={() => onConfirm(p)}>Track It</button>
      </div>
    </div>
  );
}
