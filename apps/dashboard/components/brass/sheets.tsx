"use client";
// Sheets (design.md 10.1): Ask, Moment detail, People and brief, Waiting on, Settings and privacy,
// Receipts history, Call Cortex. Reading surfaces are matte; floating ones are glass.
import { ChevronRight, Glasses, Mic, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api, snapshotSrc, videoSrc, type Brief, type Moment, type Person, type PrivacyState, type Promise_, type Receipt } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { clock, curly, dayLabel, dueChip, receiptId, timecode } from "@/lib/format";
import type { CortexData } from "@/lib/useCortex";
import { unlockSpeech, useListen, voiceSupported } from "@/lib/voice";
import { sourceLabel } from "./AskPanel";
import { Button, Chip, Frame, Label, Tag } from "./primitives";
import { Sheet } from "./Sheet";

const speak = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
};
export { speak };

// ------------------------------------------------------------------ Ask
const SUGGESTED = ["What did Ash promise me?", "What is open with Ash?", "Where did I leave my keys?", "What do I owe Dana?"];
// The demo profile has a full week to ask about.
const SUGGESTED_DEMO = ["What did Ash promise me?", "Where did I park?", "What did Sam promise me?", "When is judging?", "What does Exam 2 cover?", "Where is my charger?"];

export function AskSheet({ open, onClose, onAsk, recent }: { open: boolean; onClose: () => void; onAsk: (q: string) => void; recent: string[] }) {
  const [q, setQ] = useState("");
  const [canTalk, setCanTalk] = useState(false); // known only in the browser, so set after mount
  // Tap to talk: the words fill the box as they are heard, then the question is asked and the answer spoken back.
  const voice = useListen({ onInterim: setQ, onFinal: (text) => { onAsk(text); onClose(); } });
  useEffect(() => { setCanTalk(voiceSupported()); }, []);
  useEffect(() => { if (open) setQ(""); else voice.cancel(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const listening = voice.state === "listening";
  const chips = [...new Set([...recent, ...(isDemo() ? SUGGESTED_DEMO : SUGGESTED)])].slice(0, 6);
  return (
    <Sheet open={open} onClose={onClose} label="Ask Your Memory" title="Ask Your Memory" detent="half">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) { voice.cancel(); unlockSpeech(); onAsk(q.trim()); onClose(); } }}
      >
        {canTalk && (
          <div>
            <Button variant="primary" onClick={listening ? voice.stop : voice.start} aria-pressed={listening}>
              <Mic size={18} strokeWidth={1.5} /> {listening ? "Listening. Tap to Send" : "Tap to Talk"}
            </Button>
          </div>
        )}
        <label htmlFor="ask-input" className="sr-only">Your question</label>
        <textarea
          id="ask-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          rows={2}
          placeholder="What did Ash promise me?"
          className="t-question w-full resize-none rounded-md border border-edge bg-transparent px-4 py-3 text-text placeholder:text-text-4"
          style={{ fontSize: "max(16px, 1.625rem)" }}
          enterKeyHint="search"
        />
        <p className="t-footnote" role="status">
          {voice.state === "denied" ? "Microphone access is blocked. Allow it in Settings, or type your question."
            : voice.state === "error" ? "Voice didn't work this time. Try again, or type your question."
            : canTalk ? "Say your question. It is asked when you stop talking, and the answer is read aloud."
            : "Tap the microphone on the keyboard to ask by voice."}
        </p>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => <Chip key={c} onClick={() => { voice.cancel(); unlockSpeech(); onAsk(c); onClose(); }}>{c}</Chip>)}
        </div>
        <div><Button variant="primary" type="submit"><Send size={18} strokeWidth={1.5} /> Ask</Button></div>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Moment detail
export function MomentSheet({ m, sid, people, onClose, onDelete }: { m: Moment | null; sid: string; people: Person[]; onClose: () => void; onDelete: (m: Moment) => void }) {
  const names = m ? m.person_ids.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean) : [];
  return (
    <Sheet open={!!m} onClose={onClose} label="Moment" title={m ? `Moment ${sid}` : ""} detent="full">
      {m && (
        <div className="flex flex-col gap-6">
          {m.video_url && (
            <video
              src={videoSrc(m.video_url) ?? undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={m.caption ?? "Captured video"}
              className="aspect-video w-full rounded-sm bg-black object-contain"
            />
          )}
          {m.snapshot_url && <Frame src={snapshotSrc(m.snapshot_url)} alt={m.caption ?? "Captured frame"} selected className="w-full" ratio="16 / 10" />}
          {m.transcript && <blockquote className="t-display">{curly(m.transcript)}</blockquote>}
          <span className="t-data text-brass">{sid} - {timecode(m.ts)} - {sourceLabel(m)}</span>
          <dl className="nested grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-5">
            <dt className="t-label">When</dt><dd className="text-[0.9375rem]">{dayLabel(m.ts)}, {clock(m.ts)}</dd>
            {m.caption && <><dt className="t-label">Seen</dt><dd className="text-[0.9375rem]">{m.caption}</dd></>}
            {m.place && <><dt className="t-label">Where</dt><dd className="text-[0.9375rem]">{m.place}</dd></>}
            {names.length > 0 && <><dt className="t-label">People</dt><dd className="text-[0.9375rem]">{names.join(", ")}</dd></>}
            <dt className="t-label">Mode</dt><dd className="text-[0.9375rem] capitalize">{m.mode}</dd>
            <dt className="t-label">ID</dt><dd className="t-data break-all text-text-3">{m.id}</dd>
          </dl>
          <div><Button variant="destructive" onClick={() => onDelete(m)}>Delete Moment</Button></div>
          <p className="t-footnote">Deleting removes the transcript, captured media and anything found in it, such as promises.</p>
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ People and brief
const initials = (n: string) => n.split(" ").filter((w) => !/\.$/.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function PeopleSheet({ open, onClose, data, focusId, onEmail }: { open: boolean; onClose: () => void; data: CortexData; focusId: string | null; onEmail: (p: Person) => void }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => { if (!open) setBrief(null); }, [open]);
  const people = [...data.people].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
  const lastSeen = (p: Person) => {
    const ms = data.moments.filter((m) => m.person_ids.includes(p.id)).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    return ms[0] ? `LAST SEEN ${timecode(ms[0].ts).slice(0, 5)} ${dayLabel(ms[0].ts).toUpperCase()}` : "NOT SEEN YET";
  };
  async function doBrief(p: Person) {
    setLoading(p.id);
    try { const b = await api.brief(p.id); setBrief(b); speak(b.spoken); } finally { setLoading(null); }
  }
  return (
    <Sheet open={open} onClose={onClose} label="People" title="People" detent="full" matte>
      <div className="flex flex-col gap-4">
        {people.length === 0 && <p className="t-callout">No one yet. Say &ldquo;This is Ash from Acme.&rdquo; to add someone.</p>}
        {people.map((p) => {
          const open_ = data.promises.filter((x) => x.person_id === p.id && (x.status === "confirmed" || x.status === "proposed"));
          return (
            <article key={p.id} className="nested flex flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <span aria-hidden="true" className="flex size-12 flex-none items-center justify-center rounded-pill border-2 border-brass font-semibold text-brass">{initials(p.name)}</span>
                <div className="min-w-0">
                  <h3 className="t-headline">{p.name}</h3>
                  <p className="t-callout">{p.company ?? "No Company Yet"}{p.name_confidence < 0.8 ? " - Check the Spelling" : ""}</p>
                  <span className="t-data text-text-3">{lastSeen(p)}</span>
                </div>
              </div>
              {open_.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {open_.map((x) => { const c = dueChip(x); return (
                    <li key={x.id} className="flex items-center justify-between gap-3 text-[0.9375rem]">
                      <span>{x.direction === "waiting_on" ? `${p.name.split(" ")[0]} owes you` : "You owe"}: {x.what.toLowerCase()}</span>
                      <Tag tone={c.tone}>{c.text}</Tag>
                    </li>
                  ); })}
                </ul>
              )}
              {brief?.person.id === p.id && (
                <div className="flex flex-col gap-3 border-t border-divider pt-4">
                  <Label>Brief</Label>
                  <ul className="flex flex-col gap-2">{brief.bullets.map((b) => <li key={b} className="t-callout">{b}</li>)}</ul>
                  <span className="t-data text-text-3">FROM {brief.sources.length} MOMENT{brief.sources.length === 1 ? "" : "S"}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => doBrief(p)} disabled={loading === p.id}>{loading === p.id ? "Briefing" : "Brief Me"}</Button>
                <Button variant="ghost" onClick={() => onEmail(p)}>Draft Follow-Up</Button>
              </div>
            </article>
          );
        })}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Waiting on
export function WaitingOnSheet({ open, onClose, data, onOpenMoment, onConfirm }: { open: boolean; onClose: () => void; data: CortexData; onOpenMoment: (id: string) => void; onConfirm: (p: Promise_) => void }) {
  const list = (dir: Promise_["direction"]) => data.promises.filter((p) => p.direction === dir && p.status !== "dismissed" && p.status !== "done");
  const name = (id: string) => data.people.find((p) => p.id === id)?.name ?? "Someone";
  const Section = ({ title, items }: { title: string; items: Promise_[] }) => (
    <section className="flex flex-col gap-2">
      <Label as="h3">{title}</Label>
      {items.length === 0 && <p className="t-footnote">Nothing here.</p>}
      {items.map((p) => { const c = dueChip(p); return (
        <div key={p.id} className="nested flex items-center gap-3 p-4">
          <button type="button" className="press min-w-0 flex-1 text-left" onClick={() => onOpenMoment(p.source_moment_id)}>
            <span className="block text-[0.9375rem] font-semibold">{name(p.person_id)}</span>
            <span className="t-callout block">{p.what}</span>
          </button>
          {p.status === "proposed" ? <Button variant="secondary" onClick={() => onConfirm(p)}>Confirm</Button> : <Tag tone={c.tone}>{c.text}</Tag>}
        </div>
      ); })}
    </section>
  );
  return (
    <Sheet open={open} onClose={onClose} label="Waiting On" title="Waiting On" detent="half" matte>
      <div className="flex flex-col gap-6">
        <Section title="They Owe You" items={list("waiting_on")} />
        <Section title="You Owe" items={list("i_owe")} />
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Settings and privacy
type SettingsProps = {
  open: boolean; onClose: () => void; privacy: PrivacyState["state"]; onPrivacy: (s: PrivacyState["state"]) => void;
  solid: boolean; onSolid: (v: boolean) => void; demo: boolean; onDemo: (v: boolean) => void;
  onPairing: () => void; onReceipts: () => void; onPeople: () => void;
  user?: { name: string | null; email: string | null } | null; onSignOut?: () => void;
};
export function SettingsSheet(p: SettingsProps) {
  const states: { id: PrivacyState["state"]; label: string; hint: string }[] = [
    { id: "capturing", label: "Capturing", hint: "Cortex keeps what your glasses hear and see." },
    { id: "paused", label: "Paused", hint: "Capture is paused. Nothing is being recorded." },
    { id: "off_record", label: "Off the Record", hint: "Nothing is stored, even if heard." },
  ];
  const Row = ({ label, hint, onClick, right }: { label: string; hint?: string; onClick: () => void; right?: React.ReactNode }) => (
    <button type="button" onClick={onClick} className="press flex min-h-14 w-full items-center gap-3 rounded-md px-4 py-3 text-left active:bg-fill-soft">
      <span className="min-w-0 flex-1"><span className="block text-[0.9375rem] font-semibold">{label}</span>{hint && <span className="t-footnote block">{hint}</span>}</span>
      {right ?? <ChevronRight size={18} strokeWidth={1.5} className="text-text-3" />}
    </button>
  );
  const Toggle = ({ on }: { on: boolean }) => <span aria-hidden="true" className={`relative h-7 w-12 rounded-pill transition-colors ${on ? "bg-brass" : "bg-fill-press"}`}><span className={`absolute top-1 size-5 rounded-pill bg-text transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} /></span>;
  return (
    <Sheet open={p.open} onClose={p.onClose} label="Settings and Privacy" title="Settings and Privacy" detent="full" matte>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2" aria-label="Capture">
          <Label as="h3">Capture</Label>
          <div role="radiogroup" aria-label="Capture state" className="flex flex-col gap-1">
            {states.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={p.privacy === s.id} onClick={() => p.onPrivacy(s.id)}
                className={`press flex min-h-14 items-center gap-3 rounded-md border px-4 py-3 text-left ${p.privacy === s.id ? "border-brass bg-brass-wash" : "border-transparent active:bg-fill-soft"}`}>
                <span className="tally-ring" data-state={s.id === "capturing" ? "live" : "paused"} />
                <span className="min-w-0 flex-1"><span className="block text-[0.9375rem] font-semibold">{s.label}</span><span className="t-footnote block">{s.hint}</span></span>
              </button>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-1" aria-label="What Cortex keeps">
          <Label as="h3">What Cortex Keeps</Label>
          <Row label="Receipts" hint="Every action and answer, with proof." onClick={p.onReceipts} />
          <Row label="People" hint="Added only by introduction or consent." onClick={p.onPeople} />
          <p className="t-footnote px-4">Delete any moment from its detail sheet. Deleting also removes what was found in it.</p>
        </section>
        <section className="flex flex-col gap-1" aria-label="Connections">
          <Label as="h3">Connections</Label>
          <Row label="Pair Glasses" hint="Ray-Ban Meta through the Cortex iOS app." onClick={p.onPairing} right={<Glasses size={18} strokeWidth={1.5} className="text-text-3" />} />
        </section>
        {p.user && (
          <section className="flex flex-col gap-1" aria-label="Account">
            <Label as="h3">Account</Label>
            <div className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1"><span className="block truncate text-[0.9375rem] font-semibold">{p.user.name ?? "Signed In"}</span><span className="t-data block truncate text-text-3">{p.user.email}</span></span>
              <Button variant="secondary" onClick={p.onSignOut}>Sign Out</Button>
            </div>
          </section>
        )}
        <section className="flex flex-col gap-1" aria-label="Appearance">
          <Label as="h3">Appearance</Label>
          <Row label="Reduce Transparency" hint="Solid panels instead of glass." onClick={() => p.onSolid(!p.solid)} right={<Toggle on={p.solid} />} />
          <Row label="Demo Driver" hint="Step through the Ash script (mock only)." onClick={() => p.onDemo(!p.demo)} right={<Toggle on={p.demo} />} />
        </section>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Receipts history
export function ReceiptsSheet({ open, onClose, receipts, ids, onUndo }: { open: boolean; onClose: () => void; receipts: Receipt[]; ids: Map<string, string>; onUndo: (r: Receipt) => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Receipts" title="Receipts" detent="full" matte>
      <ol className="flex flex-col gap-2">
        {receipts.length === 0 && <p className="t-callout">No Receipts Yet</p>}
        {receipts.map((r) => {
          const live = r.action_id && r.undo.available && r.undo.until && Date.parse(r.undo.until) > Date.now();
          return (
            <li key={r.id} className="nested flex flex-col gap-1.5 p-4">
              <span className="t-data text-text-3">{r.kind.toUpperCase()} {receiptId(r.id)} - {timecode(r.created_at)}{r.source_moment_ids[0] ? ` - from ${ids.get(r.source_moment_ids[0]) ?? "m?"}` : ""}</span>
              <p className={`text-[0.9375rem] ${r.summary.startsWith("Undid") ? "text-text-3" : ""}`}>{r.summary}</p>
              {live && <div><Button variant="secondary" onClick={() => onUndo(r)}>Undo</Button></div>}
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Call Cortex (design.md 11.11)
const CALL_MS = 5 * 60 * 1000;
export function CallSheet({ open, onClose, call, moments }: { open: boolean; onClose: () => void; call: { startedAt: number } | null; moments: Moment[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!call) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [call]);
  // Clamp both ways: `now` is stale until the first tick, and the phone's clock can differ from the server's.
  const left = call ? Math.min(CALL_MS, Math.max(0, CALL_MS - (now - call.startedAt))) : CALL_MS;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const r = 34, c = 2 * Math.PI * r;
  const captions = moments.filter((m) => m.source === "call").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 6);
  return (
    <Sheet open={open} onClose={onClose} label="Call Cortex" title={call ? "On Call" : "Call Cortex"} detent="full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-5">
          <svg width="84" height="84" viewBox="0 0 84 84" aria-label={`${mmss} left of 5:00`} role="img">
            <circle cx="42" cy="42" r={r} fill="none" stroke="var(--divider)" strokeWidth="3" />
            <circle cx="42" cy="42" r={r} fill="none" stroke="var(--brass)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / CALL_MS)} style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 500ms linear" }} />
            <text x="42" y="47" textAnchor="middle" fill="var(--text)" style={{ font: "500 14px var(--font-data)" }}>{mmss}</text>
          </svg>
          <div className="flex flex-col gap-1">
            <p className="t-title">{call ? "Cortex Is on the Line" : "FaceTime Cortex from Your iPhone"}</p>
            <p className="t-callout">{call ? "Show it a card or a whiteboard. It saves what it sees." : "Call the Cortex line. It answers from your memory and can see your camera."}</p>
          </div>
        </div>
        <ul className="nested flex flex-col gap-2 p-5">
          <li className="t-data text-text-3">CALLS END AT 5:00</li>
          <li className="t-data text-text-3">ONE CALL AT A TIME</li>
          <li className="t-data text-text-3">THE LINE NUMBER IS SHARED BY THE CALL LEAD, NOT SHOWN HERE</li>
        </ul>
        <section className="flex flex-col gap-3" aria-live="polite">
          <Label as="h3">From Calls</Label>
          {captions.length === 0 && <p className="t-footnote">What the caller shows and says appears here.</p>}
          {captions.map((m) => (
            <div key={m.id} className="flex gap-3">
              <span className="t-data flex-none pt-1 text-brass">{timecode(m.ts)}</span>
              <p className="t-proof">{m.transcript ? curly(m.transcript) : m.caption}</p>
            </div>
          ))}
        </section>
      </div>
    </Sheet>
  );
}
