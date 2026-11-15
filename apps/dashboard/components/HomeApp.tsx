"use client";
// Home (design.md 10, decision D1): one vertical flow - status pill, ask and proof, suggestion,
// timeline - with the mode dock and everything else as sheets.
import { signOutAction } from "@/app/actions";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Action, type AskAnswer, type Mode, type Moment, type Person, type Promise_, type Receipt } from "@/lib/api";
import { chime } from "@/lib/chime";
import { isDemo } from "@/lib/demo";
import { friendly } from "@/lib/errors";
import { lightSeed, shortIds } from "@/lib/format";
import { givenName } from "@/lib/phone";
import type { CapturePreset, SheetKey, Tool } from "@/lib/modeTools";
import { useCortex } from "@/lib/useCortex";
import { Ambient } from "@/components/brass/Ambient";
import { ActionsSheet } from "@/components/brass/actions/ActionsSheet";
import { isOpen } from "@/components/brass/actions/meta";
import { AskPanel } from "@/components/brass/AskPanel";
import { CaptureSheet } from "@/components/brass/CaptureSheet";
import { DemoPanel } from "@/components/brass/DemoPanel";
import { MODE_ORDER, ModeDock, modeLabel } from "@/components/brass/ModeDock";
import { ModeChip } from "@/components/brass/ModeChip";
import { ModeToolsEdge, ModeToolsRail } from "@/components/brass/ModeTools";
import { CaregiverSheet, DecisionsSheet, DigestSheet, LimitsSheet, ListsSheet, LookSheet, ModeSettingsSheet, ProposalsSheet, RecapSheet, RewindSheet, RoutinesSheet } from "@/components/brass/modeSheets";
import { PairingSheet } from "@/components/brass/PairingSheet";
import { AskSheet, CallSheet, MomentSheet, PeopleSheet, primeSpeech, ReceiptsSheet, SettingsSheet, speak, WaitingOnSheet } from "@/components/brass/sheets";
import { StatusPill } from "@/components/brass/StatusPill";
import { SuggestionCard } from "@/components/brass/SuggestionCard";
import { TimelinePanel } from "@/components/brass/TimelinePanel";
import { TimelineSheet } from "@/components/brass/TimelineSheet";
import { ToastProvider, useToast } from "@/components/brass/Toast";
import { SkillsLive } from "@/components/brass/skills/SkillsLive";
import { SkillsSheet } from "@/components/brass/skills/SkillsSheet";

type SheetId = SheetKey;
const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const write = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* storage blocked */ } };

export type AppUser = { name: string | null; email: string | null; image: string | null };

export default function HomeApp({ user = null }: { user?: AppUser | null }) {
  return <ToastProvider><Home user={user} /></ToastProvider>;
}

function Home({ user }: { user: AppUser | null }) {
  // Live events: speak a routine when it is due (AST-5). The mode chime is handled below, from the mode itself.
  const { data, feed, connected, error, loaded, refresh } = useCortex((e) => {
    if (e.type === "routine.due") {
      const line = String(e.data.spoken || e.data.title || "");
      if (line) speak(line);
      toastRef.current?.({ text: `Reminder: ${String(e.data.title ?? "")}` });
    }
  });
  const loading = !loaded && !error;
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });
  const [modeLocal, setModeLocal] = useState<Mode["id"] | null>(null);
  const mode: Mode["id"] = modeLocal ?? data.modes.find((m) => m.active)?.id ?? "focus";
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [thinking, setThinking] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [sheetArg, setSheetArg] = useState<string | undefined>(undefined);
  const [capturePreset, setCapturePreset] = useState<CapturePreset | undefined>(undefined);
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
  // iOS only lets speech start from a tap: unlock it on the first one, so answers that arrive after a
  // network call can still be spoken.
  useEffect(() => {
    window.addEventListener("pointerdown", primeSpeech, { once: true, passive: true });
    return () => window.removeEventListener("pointerdown", primeSpeech);
  }, []);

  const moments = useMemo(() => data.moments.filter((m) => !pendingDelete.has(m.id)), [data.moments, pendingDelete]);
  const ids = useMemo(() => shortIds(data.moments), [data.moments]);
  const newest = useMemo(() => [...moments].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0], [moments]);
  const sel = moments.find((m) => m.id === selected) ?? null;
  // Follow new captures live, unless the person picked a moment.
  const autoFollow = useRef(true);
  useEffect(() => { if (autoFollow.current && newest) setSelected(newest.id); }, [newest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backend says which call is live (so a page opened mid-call still shows it). Without that
  // endpoint (data.call undefined) fall back to the call events seen since this page loaded.
  const call = useMemo(() => {
    if (data.call !== undefined) return data.call ? { startedAt: Date.parse(data.call.started_at) } : null;
    const last = feed.find((f) => f.type === "call.started" || f.type === "call.ended");
    return last?.type === "call.started" ? { startedAt: Date.parse(last.at) } : null;
  }, [data.call, feed]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); } catch (e) { toast({ text: friendly(e), tone: "danger" }); }
  }, [refresh, toast]);

  // ---------- modes
  const changeMode = useCallback((m: Mode["id"]) => {
    if (m === mode) return;
    setModeLocal(m);
    api.activateMode(m).then(() => refresh()).catch(() => { /* stays local if the API has no modes yet */ });
  }, [mode, refresh]);
  useEffect(() => { if (modeLocal && data.modes.find((x) => x.active)?.id === modeLocal) setModeLocal(null); }, [data.modes, modeLocal]);

  // A chime and the spoken mode name whenever the active mode changes (MODE-2): from a tap, a voice
  // command on the glasses, or accepting a suggestion. Not on the first load.
  const prevMode = useRef<string | null>(null);
  useEffect(() => {
    if (!data.modes.length) return;
    const current = data.modes.find((m) => m.active)?.id ?? null;
    if (prevMode.current && current && current !== prevMode.current) { chime(); speak(`${modeLabel(current, data.modes)} mode.`); }
    prevMode.current = current;
  }, [data.modes]);

  // ---------- ask
  const ask = useCallback(async (q: string) => {
    setQuestion(q); setThinking(true); setRecent((r) => [q, ...r.filter((x) => x !== q)].slice(0, 4));
    try {
      const [a] = await Promise.all([api.ask(q), new Promise((r) => setTimeout(r, 600))]);
      setAnswer(a);
      if (a.sources[0]) { autoFollow.current = false; setSelected(a.sources[0].id); }
      speak(a.spoken);
      refresh();
    } catch (e) { toast({ text: friendly(e, "Couldn't ask right now. Try again."), tone: "danger" }); }
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

  // ---------- skip a suggestion with undo (ACT-11, design.md 11.15): hide it now, tell the server when the undo toast closes
  const [pendingSkip, setPendingSkip] = useState<Set<string>>(new Set());
  const skipAction = useCallback((a: Action) => {
    const drop = () => setPendingSkip((s) => { const n = new Set(s); n.delete(a.id); return n; });
    setPendingSkip((s) => new Set(s).add(a.id));
    const timer = setTimeout(() => {
      api.dismissAction(a.id).then(refresh).catch((e) => toast({ text: friendly(e), tone: "danger" })).finally(drop);
    }, 9000);
    toast({ text: "Skipped", undo: () => { clearTimeout(timer); drop(); } });
  }, [refresh, toast]);

  // ---------- suggestion for the current mode (a failed one stays, so it can be retried)
  const suggestion = useMemo(() => {
    const open = data.actions.filter((a) => isOpen(a) && !pendingSkip.has(a.id) && (a.mode ?? (a.type === "follow_up_email" ? "focus" : null)) === mode);
    return open[0] ?? null; // the API lists newest first: the card shows what Cortex proposed last
  }, [data.actions, mode, pendingSkip]);

  // ---------- mode tools (the left rail): a tap opens a sheet, asks, captures with a preset, or drafts something
  const openSheet = (id: SheetId, arg?: string) => { setSheetArg(arg); if (id === "people") setPersonFocus(null); setSheet(id); };
  const openTool = (tool: Tool) => {
    const a = tool.action;
    if (a.kind === "sheet") openSheet(a.sheet, a.arg);
    else if (a.kind === "ask") void ask(a.q);
    else if (a.kind === "capture") { setCapturePreset(a.preset); setSheet("capture"); }
    else {
      const src = [...moments].sort((x, y) => Date.parse(y.ts) - Date.parse(x.ts)).find((m) => m.transcript || m.caption);
      if (!src) { toast({ text: "Capture Something First" }); return; }
      void run(async () => { await api.generate(a.type, src.id); toast({ text: `${tool.label} Ready to Approve` }); });
    }
  };
  const activeModeDoc = data.modes.find((m) => m.id === mode) ?? null;
  const modeChip = data.suggestion && data.suggestion.mode_id !== mode ? data.suggestion : null;
  const promiseOpen = data.promises.some((p) => p.status === "proposed");
  // The toast layer sits above whichever chips are showing (the promise chip and the mode chip stack above the dock).
  useEffect(() => {
    document.documentElement.style.setProperty("--chip-offset", `${((promiseOpen ? 1 : 0) + (modeChip ? 1 : 0)) * 64}px`);
    return () => { document.documentElement.style.removeProperty("--chip-offset"); };
  }, [promiseOpen, modeChip]);

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

  const pillState = !connected && error ? "offline" : call ? "on_call" : privacy;
  const proof = sel ?? null;

  return (
    <>
      <Ambient mode={mode} seed={lightSeed(sel?.ts)} paused={privacy !== "capturing"} pullKey={`${mode}:${selected ?? ""}`} />
      <div className="relative z-[1] min-h-dvh lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
          <StatusPill
            state={pillState}
            modeLabel={modeLabel(mode, data.modes)}
            onToggle={togglePause}
            onOpenSettings={() => setSheet("settings")}
            onCapture={() => { setCapturePreset(undefined); setSheet("capture"); }}
            onCall={() => setSheet("call")}
            links={[
              { label: "People", onClick: () => { setPersonFocus(null); setSheet("people"); } },
              { label: "Waiting On", onClick: () => setSheet("waiting") },
              { label: "Actions", onClick: () => setSheet("actions") },
              { label: "Receipts", onClick: () => setSheet("receipts") },
            ]}
          />

        <main
          className="home-main mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] items-start gap-4 px-4 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6 md:px-6 lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)] lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-5 lg:px-10 lg:pt-5"
          style={{ paddingBottom: "calc(var(--dock-h) + max(12px, var(--safe-bottom)) + 32px + var(--driver-offset, 0px))" }}
        >
          <div className="rise hidden min-w-0 lg:block lg:h-full lg:min-h-0" style={{ animationDelay: "330ms" }}>
            <ModeToolsRail mode={mode} modes={data.modes} onPick={openTool} onSettings={() => openSheet("modesettings")} />
          </div>
          <div className="rise min-w-0 lg:h-full lg:min-h-0" style={{ animationDelay: "350ms" }}>
            <TimelinePanel max={20} loading={loading}
              moments={moments} people={data.people} promises={data.promises} ids={ids} selected={selected}
              onSelect={(id) => { autoFollow.current = false; setSelected(id); }}
              onOpen={(id) => setMomentId(id)}
              onDelete={deleteMoment}
              onSeeAll={() => setSheet("timeline")}
              onWaitingOn={() => setSheet("waiting")}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:h-full lg:min-h-0 lg:gap-5">
            <div className="rise flex-none" style={{ animationDelay: "390ms" }}>
              <SuggestionCard
                mode={mode}
                loading={loading}
                action={suggestion}
                sourceIds={ids}
                onChanged={refresh}
                onSkip={skipAction}
                onDone={(a) => {
                  if (a.type !== "read_aloud") return;
                  const m = data.moments.find((x) => x.id === a.source_moment_ids[0]);
                  if (m) speak(m.caption ?? m.transcript ?? "");
                }}
              />
            </div>
            <div className="rise h-[400px] lg:h-auto lg:min-h-0 lg:flex-1" style={{ animationDelay: "430ms" }}>
              <AskPanel question={question} answer={answer} thinking={thinking} searched={moments.length} proof={proof} loading={loading} ids={ids} onOpenAsk={() => setSheet("ask")} onOpenMoment={(id) => setMomentId(id)} />
            </div>
            <div className="rise flex flex-wrap gap-2 lg:hidden" style={{ animationDelay: "470ms" }}>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => { setPersonFocus(null); setSheet("people"); }}>People</button>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => setSheet("waiting")}>Waiting On</button>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => setSheet("actions")}>Actions</button>
              <button type="button" className="press min-h-11 rounded-pill bg-fill-soft px-4 text-[0.8125rem] font-medium text-text-2" onClick={() => setSheet("receipts")}>Receipts</button>
            </div>
          </div>
        </main>

        <ModeDock active={mode} modes={data.modes} onChange={changeMode} onActiveTap={() => openSheet("modesettings")} onSkills={() => openSheet("skills")} />
        <ModeToolsEdge mode={mode} modes={data.modes} onPick={openTool} onSettings={() => openSheet("modesettings")} />
      </div>

      {demoOn && data.demo && <DemoPanel demo={data.demo} run={run} />}

      <AskSheet open={sheet === "ask"} onClose={() => setSheet(null)} onAsk={ask} recent={recent} />
      <MomentSheet m={data.moments.find((m) => m.id === momentId) ?? null} sid={momentId ? ids.get(momentId) ?? "m?" : ""} people={data.people} onClose={() => setMomentId(null)} onDelete={deleteMoment} />
      <TimelineSheet open={sheet === "timeline"} onClose={() => setSheet(null)} moments={moments} people={data.people} promises={data.promises} ids={ids} selected={selected}
        onSelect={(id) => { autoFollow.current = false; setSelected(id); }} onOpen={(id) => setMomentId(id)} />
      <PeopleSheet open={sheet === "people"} onClose={() => setSheet(null)} data={data} focusId={personFocus}
        onText={(p: Person) => run(async () => { await api.proposeText(p.id); setSheet(null); toast({ text: `Text to ${givenName(p.name)} Is Ready to Approve` }); })}
        onPhone={(p: Person, phone) => run(async () => { await api.updatePerson(p.id, { phone }); toast({ text: phone ? `${givenName(p.name)}'s Number Saved` : "Number Removed" }); })}
        onEmail={(p: Person) => run(async () => { await api.proposeEmail(p.id); setSheet(null); changeMode("focus"); toast({ text: `Follow-Up to ${p.name.split(" ")[0]} Is Ready to Approve` }); })} />
      <WaitingOnSheet open={sheet === "waiting"} onClose={() => setSheet(null)} data={data}
        onOpenMoment={(id) => setMomentId(id)} onConfirm={(p: Promise_) => run(() => api.confirmPromise(p.id))} />
      <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} privacy={privacy}
        onPrivacy={(s) => run(() => api.setPrivacy(s))}
        solid={solid} onSolid={(v) => { setSolid(v); write("cortex.solid", v); }}
        demoAvailable={!!data.demo} demo={demoOn} onDemo={(v) => { setDemoOn(v); write("cortex.demo", v); }}
        onPairing={() => setSheet("pairing")} onReceipts={() => setSheet("receipts")} onPeople={() => setSheet("people")}
        user={user} onSignOut={() => { void signOutAction(); }} />
      <ReceiptsSheet open={sheet === "receipts"} onClose={() => setSheet(null)} receipts={data.receipts} ids={ids}
        onUndo={(r: Receipt) => r.action_id && run(() => api.undoAction(r.action_id!))} />
      <ActionsSheet open={sheet === "actions"} onClose={() => setSheet(null)} ids={ids}
        actions={data.actions.filter((a) => !pendingSkip.has(a.id))} receipts={data.receipts}
        onOpenMoment={(id) => setMomentId(id)} onSkip={skipAction}
        onUndo={(r: Receipt) => r.action_id && run(() => api.undoAction(r.action_id!))} />
      <CallSheet open={sheet === "call"} onClose={() => setSheet(null)} call={call} moments={data.moments} />
      <CaptureSheet open={sheet === "capture"} onClose={() => setSheet(null)} privacy={privacy} preset={capturePreset}
        onSaved={(t, moment, preset) => {
          toast({ text: t }); refresh(); autoFollow.current = true;
          if (preset.then) api.generate(preset.then, moment.id).then(() => { toast({ text: "Notes Ready to Approve" }); refresh(); }).catch((e) => toast({ text: friendly(e), tone: "danger" }));
        }} />
      <RecapSheet open={sheet === "recap"} onClose={() => setSheet(null)} arg={sheetArg} onOpenMoment={(id) => setMomentId(id)} />
      <DecisionsSheet open={sheet === "decisions"} onClose={() => setSheet(null)} moments={moments} onOpenMoment={(id) => setMomentId(id)} />
      <ListsSheet open={sheet === "lists"} onClose={() => setSheet(null)} arg={sheetArg} />
      <DigestSheet open={sheet === "digest"} onClose={() => setSheet(null)} onOpenMoment={(id) => setMomentId(id)} />
      <RewindSheet open={sheet === "rewind"} onClose={() => setSheet(null)} onOpenMoment={(id) => setMomentId(id)} />
      <RoutinesSheet open={sheet === "routines"} onClose={() => setSheet(null)} />
      <CaregiverSheet open={sheet === "caregiver"} onClose={() => setSheet(null)} onSent={refresh} />
      <LookSheet open={sheet === "look"} onClose={() => setSheet(null)} arg={sheetArg} onSaved={refresh} />
      <LimitsSheet open={sheet === "limits"} onClose={() => setSheet(null)} />
      <ProposalsSheet open={sheet === "proposals"} onClose={() => setSheet(null)} arg={sheetArg} actions={data.actions} onOpenMoment={(id) => setMomentId(id)} />
      <SkillsSheet open={sheet === "skills"} onClose={() => setSheet(null)} data={data} refresh={refresh} onOpenMoment={(id) => setMomentId(id)}
        onOpenPeople={() => { setPersonFocus(null); setSheet("people"); }} onOpenWaiting={() => setSheet("waiting")} />
      <SkillsLive />
      <ModeSettingsSheet open={sheet === "modesettings"} onClose={() => setSheet(null)} mode={activeModeDoc} onChanged={refresh} onDeleted={refresh} />
      <PairingSheet open={sheet === "pairing"} onClose={() => setSheet(null)} live={privacy === "capturing"} />

      {/* Proposed promises surface as a confirm chip right above the dock (D-4 one-tap confirm). */}
      <PromiseChip promises={data.promises} people={data.people} onConfirm={(p) => run(() => api.confirmPromise(p.id))} />
      <ModeChip suggestion={modeChip} modes={data.modes} slot={promiseOpen ? 1 : 0}
        onSwitch={(id) => changeMode(id)}
        onDismiss={() => run(() => api.dismissModeSuggestion())} />
    </>
  );
}

function PromiseChip({ promises, people, onConfirm }: { promises: Promise_[]; people: Person[]; onConfirm: (p: Promise_) => void }) {
  const p = promises.filter((x) => x.status === "proposed").at(-1);
  const who = p ? people.find((x) => x.id === p.person_id)?.name.split(" ")[0] ?? "Someone" : "";
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[25] flex justify-center px-4" style={{ bottom: "calc(max(12px, var(--safe-bottom)) + var(--dock-h) + 16px + var(--driver-offset, 0px))" }}>
      <AnimatePresence>
        {p && (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="glass glass--pill glass--float pointer-events-auto flex max-w-full items-center gap-3 py-2 pl-5 pr-2"
            role="status"
          >
            <span className="tally-ring" />
            <span className="line-clamp-2 min-w-0 text-[0.9375rem]">{who} will {p.what.toLowerCase()}{p.due.text ? ` by ${p.due.text}` : ""}</span>
            <button type="button" className="press min-h-11 flex-none rounded-pill bg-fill-soft px-5 text-[0.9375rem] font-semibold hover:bg-fill-press" onClick={() => onConfirm(p)}>Track It</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
