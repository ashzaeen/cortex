"use client";
// Sheets behind the mode tools (MODE-1..7, DASH-10): recap and live notes, decisions, lists, digest,
// rewind, routines, caregiver, look, limits, proposals and mode settings. Reading surfaces are matte,
// every action is one brass button, every error is one plain line (design.md 11.14, 11.16).
import { Camera, Mic, Plus, Trash2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api, type Action, type Caregiver, type CortexList, type Digest as DigestT, type LookResult, type LookTask, type Mode, type Moment,
  type Recap, type Rewind as RewindT, type Routine,
} from "@/lib/api";
import { friendly } from "@/lib/errors";
import { clock, curly, dayLabel } from "@/lib/format";
import { fileToJpeg } from "./CaptureSheet";
import { Button, Chip, Label, Tag } from "./primitives";
import { Sheet } from "./Sheet";
import { speak } from "./sheets";
import { useToast } from "./Toast";

const FIELD = "w-full rounded-md border border-edge bg-transparent px-4 py-3 text-base text-text placeholder:text-text-4";

/** Loads when the sheet opens, reloads on demand, and says plainly when it fails. */
function useLoad<T>(open: boolean, fn: () => Promise<T>, key = "") {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await latest.current()); setErr(null); } catch (e) { setErr(friendly(e, "Couldn't load that. Try again.")); } finally { setBusy(false); }
  }, []);
  useEffect(() => { if (open) void load(); else { setData(null); setErr(null); } }, [open, key, load]);
  return { data, err, busy, reload: load, setData };
}

const Status = ({ busy, err, empty }: { busy: boolean; err: string | null; empty?: string | null }) =>
  err ? <p role="alert" className="text-[0.9375rem] text-danger">{err}</p>
    : busy ? <p className="t-footnote" role="status">Loading</p>
    : empty ? <p className="t-footnote">{empty}</p> : null;

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-medium">{label}</p>
        {hint && <p className="t-footnote">{hint}</p>}
      </div>
      <button
        type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`press relative h-8 w-14 flex-none rounded-pill border border-edge ${on ? "bg-brass" : "bg-fill-soft"}`}
      >
        <span className={`absolute top-1 size-6 rounded-full transition-[left] duration-150 ${on ? "left-7 bg-ink" : "left-1 bg-text-3"}`} />
      </button>
    </div>
  );
}

/** A line of text that opens the moment it came from. */
function ProofLine({ text, momentId, at, onOpen }: { text: string; momentId: string; at?: string; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(momentId)} className="press nested flex w-full flex-col gap-1 p-4 text-left hover:bg-fill-press">
        <span className="text-[0.9375rem]">{curly(text)}</span>
        {at && <span className="t-data text-text-3">{clock(at)} · Open the moment</span>}
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ Recap, Live Notes, Action Items (FOC-1, FOC-2, STU-1)
export function RecapSheet({ open, onClose, arg, onOpenMoment }: { open: boolean; onClose: () => void; arg?: string; onOpenMoment: (id: string) => void }) {
  const kind = arg === "lecture" ? "lecture" : "meeting";
  const title = arg === "lecture" ? "Live Notes" : arg === "actions" ? "Action Items" : "Recap";
  const { data, err, busy } = useLoad<Recap>(open, () => api.recap(kind), kind);
  const none = data && data.moment_count === 0;
  return (
    <Sheet open={open} onClose={onClose} label={title} title={title} detent="full" matte>
      <div className="flex flex-col gap-5">
        <Status busy={busy && !data} err={err} empty={none ? data.spoken : null} />
        {data && !none && (
          <>
            <div className="flex flex-col gap-2">
              <Label>{data.title}</Label>
              <p className="t-display">{data.spoken}</p>
              <p className="t-data text-text-3">{data.moment_count} moment{data.moment_count === 1 ? "" : "s"} ·{data.started_at ? `${dayLabel(data.started_at)}, ${clock(data.started_at)}` : ""}</p>
            </div>
            <div><Button variant="secondary" onClick={() => speak(data.spoken)}><Volume2 size={18} strokeWidth={1.5} /> Read Aloud</Button></div>
            {arg !== "actions" && data.decisions.length > 0 && (
              <section className="flex flex-col gap-2"><Label as="h3">Decisions</Label>
                <ul className="flex flex-col gap-2">{data.decisions.map((d) => <ProofLine key={d.moment_id} text={d.text} momentId={d.moment_id} at={d.at} onOpen={onOpenMoment} />)}</ul></section>
            )}
            <section className="flex flex-col gap-2"><Label as="h3">Action Items</Label>
              {data.follow_ups.length
                ? <ul className="flex flex-col gap-2">{data.follow_ups.map((f) => <ProofLine key={f.moment_id} text={f.text} momentId={f.moment_id} at={f.at} onOpen={onOpenMoment} />)}</ul>
                : <p className="t-footnote">No action items in this session.</p>}
            </section>
            {arg !== "actions" && data.notes.length > 0 && (
              <section className="flex flex-col gap-2"><Label as="h3">Notes</Label>
                <ul className="flex flex-col gap-2">{data.notes.map((n) => <ProofLine key={n.moment_id} text={n.text} momentId={n.moment_id} at={n.at} onOpen={onOpenMoment} />)}</ul></section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Decisions (FOC-5)
export function DecisionsSheet({ open, onClose, moments, onOpenMoment }: { open: boolean; onClose: () => void; moments: Moment[]; onOpenMoment: (id: string) => void }) {
  const list = moments.filter((m) => m.tags?.includes("decision")).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return (
    <Sheet open={open} onClose={onClose} label="Decisions" title="Decisions" detent="half" matte>
      <div className="flex flex-col gap-4">
        {list.length === 0
          ? <p className="t-footnote">No decisions yet. When someone says “we decided” or “let’s go with”, it lands here.</p>
          : <ul className="flex flex-col gap-2">{list.map((m) => <ProofLine key={m.id} text={m.transcript ?? m.caption ?? ""} momentId={m.id} at={m.ts} onOpen={onOpenMoment} />)}</ul>}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Lists: Shopping and Expenses (LIF-1, LIF-2)
export function ListsSheet({ open, onClose, arg }: { open: boolean; onClose: () => void; arg?: string }) {
  const [tab, setTab] = useState<"shopping" | "expenses">("shopping");
  const [text, setText] = useState(""); const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { data, err, busy, reload } = useLoad<{ items: CortexList[] }>(open, () => api.lists());
  useEffect(() => { if (open) setTab(arg === "expenses" ? "expenses" : "shopping"); }, [open, arg]);
  const list = data?.items.find((l) => l.id === tab);
  const act = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); await reload(); } catch (e) { setMsg(friendly(e)); } };
  return (
    <Sheet open={open} onClose={onClose} label="Lists" title={tab === "shopping" ? "Shopping" : "Expenses"} detent="full" matte>
      <div className="flex flex-col gap-5">
        <div className="flex gap-2" role="group" aria-label="List">
          <Chip selected={tab === "shopping"} onClick={() => setTab("shopping")}>Shopping</Chip>
          <Chip selected={tab === "expenses"} onClick={() => setTab("expenses")}>Expenses</Chip>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim(); if (!t) return;
          const a = tab === "expenses" && amount.trim() ? Number(amount) : null;
          if (a !== null && !Number.isFinite(a)) { setMsg("Enter the amount as a number."); return; }
          void act(async () => { await api.addListItem(tab, t, a); setText(""); setAmount(""); });
        }}>
          <label className="sr-only" htmlFor="list-text">{tab === "shopping" ? "Item" : "What for"}</label>
          <input id="list-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === "shopping" ? "Oat milk" : "Lunch"} className={FIELD} maxLength={200} />
          {tab === "expenses" && (<>
            <label className="sr-only" htmlFor="list-amount">Amount</label>
            <input id="list-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="12.50" inputMode="decimal" className={`${FIELD} sm:w-32`} />
          </>)}
          <Button variant="primary" type="submit"><Plus size={18} strokeWidth={1.5} /> Add</Button>
        </form>
        {msg && <p role="alert" className="text-[0.9375rem] text-danger">{msg}</p>}
        <Status busy={busy && !data} err={err} empty={list && list.items.length === 0 ? (tab === "shopping" ? "Nothing on the list. Say “add oat milk to my shopping list”." : "No expenses yet. Say “log this receipt, $12 for lunch”.") : null} />
        {list && list.items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {list.items.map((it) => (
              <li key={it.id} className="nested flex items-center gap-3 p-3">
                <input type="checkbox" checked={it.done} aria-label={`${it.text}, ${tab === "shopping" ? "bought" : "reconciled"}`} className="size-6 flex-none accent-[var(--brass)]"
                  onChange={(e) => act(() => api.updateListItem(tab, it.id, { done: e.target.checked }))} />
                <span className={`min-w-0 flex-1 text-[0.9375rem] ${it.done ? "text-text-3 line-through" : ""}`}>{it.text}</span>
                {it.amount != null && <span className="t-data">${it.amount.toFixed(2)}</span>}
                <button type="button" aria-label={`Remove ${it.text}`} className="press inline-flex size-11 flex-none items-center justify-center rounded-pill hover:bg-fill-press"
                  onClick={() => act(() => api.deleteListItem(tab, it.id))}><Trash2 size={16} strokeWidth={1.5} /></button>
              </li>
            ))}
          </ul>
        )}
        {tab === "expenses" && list?.total != null && list.items.length > 0 && <p className="t-headline">Total ${list.total.toFixed(2)}</p>}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Digest (MEM-9)
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function DigestSheet({ open, onClose, onOpenMoment }: { open: boolean; onClose: () => void; onOpenMoment: (id: string) => void }) {
  const [date, setDate] = useState(today());
  useEffect(() => { if (open) setDate(today()); }, [open]);
  const { data, err, busy } = useLoad<DigestT>(open, () => api.digest(date), date);
  return (
    <Sheet open={open} onClose={onClose} label="Digest" title="Digest" detent="full" matte>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label as="label" htmlFor="digest-date">Day</Label>
          <input id="digest-date" type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${FIELD} sm:w-56`} />
        </div>
        <Status busy={busy && !data} err={err} />
        {data && (
          <>
            <p className="t-display">{data.spoken}</p>
            {data.bullets.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem]">{data.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => speak(data.spoken)}><Volume2 size={18} strokeWidth={1.5} /> Read Aloud</Button>
              {data.source_moment_ids[0] && <Button variant="ghost" onClick={() => onOpenMoment(data.source_moment_ids[0])}>Open First Moment</Button>}</div>
            {data.people.length > 0 && <p className="t-footnote">Met: {data.people.map((p) => p.name).join(", ")}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Rewind (MEM-10)
export function RewindSheet({ open, onClose, onOpenMoment }: { open: boolean; onClose: () => void; onOpenMoment: (id: string) => void }) {
  const [q, setQ] = useState(""); const [out, setOut] = useState<RewindT | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!open) { setQ(""); setOut(null); setErr(null); } }, [open]);
  return (
    <Sheet open={open} onClose={onClose} label="Rewind" title="Rewind" detent="half">
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault(); if (!q.trim()) return; setBusy(true); setErr(null);
        try { const r = await api.rewind(q.trim()); setOut(r); speak(r.spoken); } catch (x) { setErr(friendly(x, "Couldn't search. Try again.")); } finally { setBusy(false); }
      }}>
        <label className="sr-only" htmlFor="rewind-q">What to find</label>
        <input id="rewind-q" data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where did I park?" className={FIELD} enterKeyHint="search" />
        <div><Button variant="primary" type="submit" disabled={busy}>{busy ? "Searching" : "Find the Moment"}</Button></div>
        {err && <p role="alert" className="text-[0.9375rem] text-danger">{err}</p>}
        {out && (
          <div className="nested flex flex-col gap-3 p-4">
            <p className="text-[0.9375rem]">{out.found ? out.spoken : "I couldn't find that in memory."}</p>
            {out.line && <blockquote className="t-display">{curly(out.line)}</blockquote>}
            {out.moment && <div><Button variant="secondary" onClick={() => onOpenMoment(out.moment!.id)}>Open the Moment</Button></div>}
          </div>
        )}
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Routines (AST-5)
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export function RoutinesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(""); const [time, setTime] = useState("08:00"); const [days, setDays] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, err, busy, reload } = useLoad<{ items: Routine[] }>(open, () => api.routines());
  const act = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); await reload(); } catch (e) { setMsg(friendly(e)); } };
  const when = (r: Routine) => `${r.time} · ${r.days.length ? r.days.join(", ") : "every day"}`;
  return (
    <Sheet open={open} onClose={onClose} label="Routine" title="Routine" detent="full" matte>
      <div className="flex flex-col gap-5">
        <p className="t-footnote">Cortex says each reminder out loud at its time. This is wellness support, not a medical device.</p>
        <form className="nested flex flex-col gap-3 p-4" onSubmit={(e) => {
          e.preventDefault(); if (!title.trim()) { setMsg("Name the reminder first."); return; }
          void act(async () => { await api.createRoutine({ title: title.trim(), time, days: days as Routine["days"] }); setTitle(""); setDays([]); });
        }}>
          <label className="sr-only" htmlFor="routine-title">Reminder</label>
          <input id="routine-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Take the evening medicine" className={FIELD} maxLength={120} />
          <div className="flex items-center gap-3">
            <label className="t-label" htmlFor="routine-time">At</label>
            <input id="routine-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${FIELD} w-40`} />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Days (none means every day)">
            {DAYS.map((d) => <Chip key={d} selected={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>{d}</Chip>)}
          </div>
          <div><Button variant="primary" type="submit"><Plus size={18} strokeWidth={1.5} /> Add Routine</Button></div>
        </form>
        {msg && <p role="alert" className="text-[0.9375rem] text-danger">{msg}</p>}
        <Status busy={busy && !data} err={err} empty={data && data.items.length === 0 ? "No routines yet." : null} />
        {data && data.items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {data.items.map((r) => (
              <li key={r.id} className="nested flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[0.9375rem] font-medium">{r.title}</p><p className="t-data text-text-3">{when(r)}</p></div>
                  <Tag tone={r.active ? "brass" : "muted"}>{r.active ? "On" : "Off"}</Tag>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => act(() => api.updateRoutine(r.id, { active: !r.active }))}>{r.active ? "Turn Off" : "Turn On"}</Button>
                  <Button variant="destructive" onClick={() => act(() => api.deleteRoutine(r.id))}><Trash2 size={16} strokeWidth={1.5} /> Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Caregiver (AST-6, AST-7)
export function CaregiverSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const { data, err, busy, reload, setData } = useLoad<Caregiver>(open, () => api.caregiver());
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [sendAt, setSendAt] = useState("20:00");
  const [msg, setMsg] = useState<string | null>(null); const [working, setWorking] = useState(false);
  useEffect(() => { if (data) { setName(data.name ?? ""); setEmail(data.email ?? ""); setSendAt(data.send_at); } }, [data?.consent, data?.email, data?.name, data?.send_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { setMsg(null); setWorking(true); try { await fn(); } catch (e) { setMsg(friendly(e)); } finally { setWorking(false); } };
  return (
    <Sheet open={open} onClose={onClose} label="Caregiver" title="Caregiver" detent="full" matte>
      <div className="flex flex-col gap-5">
        <Status busy={busy && !data} err={err} />
        {data && (
          <>
            <p className="text-[0.9375rem]">Share a short summary of your day with someone you trust. Nothing is shared until you turn this on, and you can turn it off at any moment.</p>
            <section className="nested flex flex-col gap-2 p-4">
              <Label as="h3">What Is Shared</Label>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem]">{data.shares.map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
            <div className="flex flex-col gap-3">
              <label className="t-label" htmlFor="cg-name">Their Name</label>
              <input id="cg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Robin" className={FIELD} maxLength={80} />
              <label className="t-label" htmlFor="cg-email">Their Email</label>
              <input id="cg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="robin@example.com" className={FIELD} />
              <label className="t-label" htmlFor="cg-time">Send Each Day At</label>
              <input id="cg-time" type="time" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className={`${FIELD} w-40`} />
            </div>
            <Switch on={data.consent} label="I agree to share this summary" hint={data.consent && data.consented_at ? `On since ${dayLabel(data.consented_at)}` : "Off"}
              onChange={(v) => act(async () => { setData(await api.setCaregiver({ consent: v, name: name.trim() || null, email: email.trim() || null, send_at: sendAt })); toast({ text: v ? "Sharing Is On" : "Sharing Is Off" }); })} />
            {data.consent && (
              <div><Button variant="secondary" disabled={working} onClick={() => act(async () => {
                setData(await api.setCaregiver({ consent: true, name: name.trim() || null, email: email.trim() || null, send_at: sendAt })); toast({ text: "Saved" });
              })}>Save Changes</Button></div>
            )}
            <section className="nested flex flex-col gap-2 p-4">
              <Label as="h3">Exactly What Today’s Email Says</Label>
              <p className="text-[0.9375rem] font-semibold">{data.preview.subject}</p>
              <pre className="whitespace-pre-wrap font-[inherit] text-[0.9375rem] text-text-2">{data.preview.body}</pre>
            </section>
            {msg && <p role="alert" className="text-[0.9375rem] text-danger">{msg}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!data.consent || working} onClick={() => act(async () => {
                await api.sendCaregiver(); toast({ text: "Summary Sent. Undo it in Receipts." }); onSent(); await reload();
              })}>Send Today’s Summary Now</Button>
              {data.last_sent_at && <span className="t-footnote">Last sent {dayLabel(data.last_sent_at)}, {clock(data.last_sent_at)}</span>}
            </div>
            <p className="t-footnote">Cortex sends this on its own each day once you agree. While email is in dry-run it saves a draft instead. Cortex never shares audio, pictures or anyone else’s details.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Look: Describe, Read Aloud, Hazards, Find, Tutor (AST-1..4, STU-6, LIF-4)
const LOOK_COPY: Record<LookTask, { title: string; button: string; field?: { label: string; placeholder: string; key: "target" | "question" } }> = {
  describe: { title: "Describe", button: "Describe What You See" },
  read: { title: "Read Aloud", button: "Read What You See" },
  hazards: { title: "Hazards", button: "Check for Hazards", field: { label: "Look for (optional)", placeholder: "The door", key: "target" } },
  find: { title: "Find It", button: "Find It", field: { label: "What to find", placeholder: "My keys", key: "target" } },
  tutor: { title: "Tutor Me", button: "Help Me With This", field: { label: "What do you need? (optional)", placeholder: "Why is the second step true?", key: "question" } },
};
export function LookSheet({ open, onClose, arg, onSaved }: { open: boolean; onClose: () => void; arg?: string; onSaved: () => void }) {
  const task: LookTask = (["describe", "read", "hazards", "find", "tutor"].includes(arg ?? "") ? arg : "describe") as LookTask;
  const copy = LOOK_COPY[task];
  const toast = useToast();
  const [photo, setPhoto] = useState<string | null>(null); const [field, setField] = useState("");
  const [out, setOut] = useState<LookResult | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (open) { setPhoto(null); setField(""); setOut(null); setMsg(null); } }, [open, task]);
  const run = async () => {
    setBusy(true); setMsg(null); setOut(null);
    try {
      const body: Parameters<typeof api.look>[0] = { task, snapshot_base64: photo };
      if (copy.field && field.trim()) body[copy.field.key] = field.trim();
      const r = await api.look(body); setOut(r); speak(r.spoken);
    } catch (e) { setMsg(friendly(e, "Couldn't look right now. Try again.")); } finally { setBusy(false); }
  };
  const canRun = task !== "find" || field.trim().length > 0;
  return (
    <Sheet open={open} onClose={onClose} label={copy.title} title={copy.title} detent="full" matte>
      <div className="flex flex-col gap-5">
        <p className="t-footnote">Take a photo of what is in front of you, or run it without one to use the latest view Cortex has. The photo is used for this answer and is not saved unless you tap Save.</p>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/jpeg;base64,${photo}`} alt="Photo to look at" className="w-full rounded-lg object-cover" style={{ aspectRatio: "4 / 3" }} />
        )}
        <label className="press inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-pill border border-edge bg-fill-soft px-5 text-[0.9375rem] font-semibold">
          <Camera size={18} strokeWidth={1.5} /> {photo ? "Retake Photo" : "Take Photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setPhoto(await fileToJpeg(f)); setOut(null); } catch (x) { setMsg((x as Error).message); } }} />
        </label>
        {copy.field && (
          <div className="flex flex-col gap-2">
            <Label as="label" htmlFor="look-field">{copy.field.label}</Label>
            <input id="look-field" value={field} onChange={(e) => setField(e.target.value)} placeholder={copy.field.placeholder} className={FIELD} />
          </div>
        )}
        <div><Button variant="primary" onClick={run} disabled={busy || !canRun}>{busy ? "Looking" : copy.button}</Button></div>
        {msg && <p role="alert" className="text-[0.9375rem] text-danger">{msg}</p>}
        {out && (
          <section className="nested flex flex-col gap-3 p-4" aria-live="polite">
            {out.found !== null && <Tag tone={out.found ? "ok" : "muted"}>{out.found ? "Found" : "Not seen"}</Tag>}
            <p className="text-[1.0625rem]">{out.text}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => speak(out.spoken)}><Volume2 size={18} strokeWidth={1.5} /> Read Aloud</Button>
              {photo && task !== "tutor" && (
                <Button variant="secondary" onClick={async () => {
                  try { await api.capture({ transcript: out.text, snapshot_base64: photo }); toast({ text: "Saved to Memory" }); onSaved(); } catch (e) { setMsg(friendly(e, "Couldn't save. Nothing was stored.")); }
                }}><Mic size={18} strokeWidth={1.5} /> Save to Memory</Button>
              )}
            </div>
          </section>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Limits (AST-8)
export function LimitsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Limits" title="What Cortex Can and Cannot Do" detent="half" matte>
      <div className="flex flex-col gap-4 text-[0.9375rem]">
        <p>Cortex helps you read, find things and keep routines. It can get things wrong, so check anything that matters.</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>It is not a medical device. Do not rely on it for your health or safety.</li>
          <li>It is not a navigation or emergency aid. It cannot call for help.</li>
          <li>It may misread text or miss a hazard. Cortex says so when it is unsure.</li>
          <li>It never recognizes faces. People enter memory only when you introduce them.</li>
          <li>A caregiver sees a daily summary only after you agree, and you can stop at any time.</li>
        </ul>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Proposals: Deadlines, Study Blocks, Reminders, Messages
const PROPOSALS: Record<string, { title: string; empty: string; match: (a: Action) => boolean }> = {
  deadlines: { title: "Deadlines", empty: "No deadlines caught yet. Say “the midterm is due Friday”.", match: (a) => a.type === "calendar_event" && /^due:/i.test(a.title ?? "") },
  study: { title: "Study Blocks", empty: "No study blocks yet. One is proposed the evening before each deadline.", match: (a) => a.type === "calendar_event" && /^study for/i.test(a.title ?? "") },
  reminders: { title: "Reminders", empty: "No reminders suggested yet.", match: (a) => a.type === "reminder" },
  messages: { title: "Messages", empty: "No texts waiting.", match: (a) => a.type === "message" },
};
export function ProposalsSheet({ open, onClose, arg, actions, onOpenMoment }: { open: boolean; onClose: () => void; arg?: string; actions: Action[]; onOpenMoment: (id: string) => void }) {
  const p = PROPOSALS[arg ?? "deadlines"] ?? PROPOSALS.deadlines;
  const list = actions.filter(p.match).sort((a, b) => (a.event?.start ?? "").localeCompare(b.event?.start ?? ""));
  return (
    <Sheet open={open} onClose={onClose} label={p.title} title={p.title} detent="half" matte>
      <div className="flex flex-col gap-4">
        {list.length === 0 ? <p className="t-footnote">{p.empty}</p> : (
          <ul className="flex flex-col gap-2">
            {list.map((a) => (
              <li key={a.id} className="nested flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3"><p className="text-[0.9375rem] font-medium">{a.title}</p>
                  <Tag tone={a.status === "proposed" ? "brass" : "muted"}>{a.status.replace("_", " ")}</Tag></div>
                {a.event && <p className="t-data text-text-3">{new Date(a.event.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
                {a.summary && <p className="text-[0.9375rem] text-text-2">{a.summary}</p>}
                {a.source_moment_ids[0] && <div><Button variant="ghost" onClick={() => onOpenMoment(a.source_moment_ids[0])}>Open the Moment</Button></div>}
              </li>
            ))}
          </ul>
        )}
        <p className="t-footnote">Approve a proposal from the suggestion card in its mode. Nothing is added until you do.</p>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Mode settings (DASH-10, MODE-1, MODE-7)
const ACTION_LABEL: Record<string, string> = {
  follow_up_email: "Follow-up emails", flashcards: "Flashcards", reminder: "Reminders", read_aloud: "Read aloud",
  calendar_event: "Calendar events", notes: "Notes", message: "Texts", caregiver_summary: "Caregiver summary",
};
const KEEP: { label: string; value: number | null }[] = [
  { label: "Until I delete", value: null }, { label: "1 day", value: 1 }, { label: "7 days", value: 7 }, { label: "30 days", value: 30 }, { label: "90 days", value: 90 },
];
export function ModeSettingsSheet({ open, onClose, mode, onChanged, onDeleted }: { open: boolean; onClose: () => void; mode: Mode | null; onChanged: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (open) setMsg(null); }, [open]);
  if (!mode) return <Sheet open={false} onClose={onClose} label="Mode settings">{null}</Sheet>;
  const save = async (body: Parameters<typeof api.updateMode>[1]) => { setMsg(null); try { await api.updateMode(mode.id, body); onChanged(); } catch (e) { setMsg(friendly(e)); } };
  const all = Object.keys(ACTION_LABEL);
  const allowed = new Set<string>(mode.allowed_actions);
  const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="flex flex-col gap-2"><Label as="h3" id={k}>{k}</Label>{children}</div>;
  return (
    <Sheet open={open} onClose={onClose} label={`${mode.name} settings`} title={`${mode.name} Settings`} detent="full" matte>
      <div className="flex flex-col gap-6">
        {mode.description && <p className="text-[0.9375rem] text-text-2">{mode.description}</p>}
        <Switch on={mode.auto_suggest !== false} label="Suggest actions on its own" hint="Off: Cortex only answers in this mode and proposes nothing by itself."
          onChange={(v) => save({ auto_suggest: v })} />
        <Row k="Cortex May Suggest">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Actions Cortex may suggest on its own">
            {all.map((a) => (
              <Chip key={a} selected={allowed.has(a)} onClick={() => save({ allowed_actions: (allowed.has(a) ? [...allowed].filter((x) => x !== a) : [...allowed, a]) as Mode["allowed_actions"] })}>
                {ACTION_LABEL[a]}
              </Chip>
            ))}
          </div>
          <p className="t-footnote">This only limits what Cortex suggests by itself. You can still ask for any of them directly.</p>
        </Row>
        <Row k="Keep Moments From This Mode">
          <div className="flex flex-wrap gap-2" role="group" aria-label="How long moments are kept">
            {KEEP.map((o) => <Chip key={o.label} selected={(mode.retention_days ?? null) === o.value} onClick={() => save({ retention_days: o.value })}>{o.label}</Chip>)}
          </div>
          <p className="t-footnote">This is your choice, saved with the mode. Automatic deletion is not switched on yet, so nothing is removed for you. You can delete any moment yourself at any time.</p>
        </Row>
        <dl className="nested grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-5">
          <dt className="t-label">Listens To</dt><dd className="text-[0.9375rem]">{mode.captures.join(", ") || "Nothing special"}</dd>
          <dt className="t-label">Speaks</dt><dd className="text-[0.9375rem]">{mode.speaks}</dd>
          <dt className="t-label">Proposes</dt><dd className="text-[0.9375rem]">{mode.proposes.join(", ") || "Nothing"}</dd>
        </dl>
        {msg && <p role="alert" className="text-[0.9375rem] text-danger">{msg}</p>}
        {mode.custom && (
          <div><Button variant="destructive" onClick={async () => {
            try { await api.deleteMode(mode.id); toast({ text: `${mode.name} Deleted` }); onDeleted(); onClose(); } catch (e) { setMsg(friendly(e)); }
          }}><Trash2 size={16} strokeWidth={1.5} /> Delete This Mode</Button></div>
        )}
      </div>
    </Sheet>
  );
}
