"use client";
import { useState } from "react";
import { api, type AskAnswer, type Brief } from "@/lib/api";
import type { CortexData, FeedItem } from "@/lib/useCortex";
import { MomentCard } from "./MomentCard";
import { Button, Card, Empty, Section, speak, time } from "./ui";

type Run = (fn: () => Promise<unknown>) => Promise<void>;

// ------------------------------------------------------------------ Live
export function LiveTab({ data, feed, run }: { data: CortexData; feed: FeedItem[]; run: Run }) {
  const [say, setSay] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const proposed = data.promises.filter((p) => p.status === "proposed");
  const pendingEmails = data.actions.filter((a) => a.status === "proposed");
  const waiting = data.promises.filter((p) => p.status === "confirmed" && p.direction === "waiting_on");
  const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? "Someone";
  const recentPeople = [...data.people].reverse().slice(0, 4);
  const demo = data.demo;
  const next = demo && demo.index < demo.total ? demo.steps[demo.index] : null;

  return (
    <div className="flex flex-col gap-5">
      {demo && (
        <Section title={`Demo driver · step ${Math.min(demo.index + 1, demo.total)} of ${demo.total}`}>
          <Card className="flex flex-col gap-2">
            {next ? (
              <>
                <p className="text-sm font-medium">{next.beat}: {next.label}</p>
                <p className="text-xs text-muted">You: {next.you}</p>
              </>
            ) : (
              <p className="text-sm">Script complete. Reset to run it again.</p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => run(api.demo.next)} disabled={!next}>Next step</Button>
              <Button variant="ghost" onClick={() => run(api.demo.play)} disabled={!next}>Play all</Button>
              <Button variant="ghost" onClick={() => run(api.demo.reset)}>Reset</Button>
            </div>
          </Card>
        </Section>
      )}

      {proposed.length > 0 && (
        <Section title="Confirm">
          {proposed.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <p className="text-sm">
                <b>{nameOf(p.person_id)}</b> will {p.what.toLowerCase()}
                {p.due.text ? ` by ${p.due.text}` : ""}
              </p>
              <Button onClick={() => run(() => api.confirmPromise(p.id))}>Confirm</Button>
            </Card>
          ))}
        </Section>
      )}

      {pendingEmails.length > 0 && (
        <Section title="Approve">
          {pendingEmails.map((a) => (
            <Card key={a.id} className="flex flex-col gap-2">
              <p className="text-xs text-muted">Follow-up email to {a.draft.to}</p>
              <p className="text-sm font-medium">{a.draft.subject}</p>
              <p className="whitespace-pre-line text-sm text-muted">{a.draft.body}</p>
              <div className="flex gap-2">
                <Button onClick={() => run(() => api.confirmAction(a.id, "send"))}>Send</Button>
                <Button variant="ghost" onClick={() => run(() => api.confirmAction(a.id, "draft"))}>Save draft</Button>
              </div>
            </Card>
          ))}
        </Section>
      )}

      <Section title="People">
        {recentPeople.length === 0 && <Empty>No one yet. Say &ldquo;This is Ash from Acme.&rdquo;</Empty>}
        {recentPeople.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.company ?? "No company"} · added by {p.consent}
                  {p.name_confidence < 0.8 && " · check spelling"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  onClick={() => run(async () => { const b = await api.brief(p.id); setBrief(b); speak(b.spoken); })}
                >
                  Brief
                </Button>
                <Button variant="ghost" onClick={() => run(() => api.proposeEmail(p.id))}>Email</Button>
              </div>
            </div>
            {brief?.person.id === p.id && (
              <div className="rounded-lg bg-bg p-2 text-sm">
                <ul className="list-disc pl-5">
                  {brief.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <p className="mt-1 text-xs text-muted">From {brief.sources.length} moment(s)</p>
              </div>
            )}
          </Card>
        ))}
      </Section>

      <Section title="Waiting on">
        {waiting.length === 0 && <Empty>Nothing yet.</Empty>}
        {waiting.map((p) => (
          <Card key={p.id} className="text-sm">
            <b>{nameOf(p.person_id)}</b>: {p.what}
            <span className="text-muted"> · due {p.due.text ?? "no date"}{p.due.date ? ` (${p.due.date})` : ""}</span>
          </Card>
        ))}
      </Section>

      <Section title="Say something (simulated capture)">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!say.trim()) return;
            const text = say.trim();
            setSay("");
            run(() => api.ingest(text));
          }}
        >
          <input
            id="say"
            value={say}
            onChange={(e) => setSay(e.target.value)}
            placeholder="This is Ash from Acme."
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-base"
          />
          <Button type="submit">Add</Button>
        </form>
      </Section>

      <Section title="Activity">
        {feed.length === 0 && <Empty>Live events appear here as they happen.</Empty>}
        <ol className="flex flex-col gap-1">
          {feed.map((f) => (
            <li key={f.id} className="flex gap-2 text-sm">
              <span className="shrink-0 tabular-nums text-xs leading-5 text-muted">
                {new Date(f.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </span>
              <span>{f.text}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Timeline
export function TimelineTab({ data, run }: { data: CortexData; run: Run }) {
  if (!data.moments.length) return <Empty>No moments yet.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {data.moments.map((m) => (
        <MomentCard
          key={m.id}
          m={m}
          people={data.people}
          action={
            <div>
              <Button variant="danger" className="mt-1 min-h-8 text-xs" onClick={() => run(() => api.deleteMoment(m.id))}>
                Delete moment
              </Button>
            </div>
          }
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Ask
export function AskTab({ data, run }: { data: CortexData; run: Run }) {
  const [q, setQ] = useState("What did Ash promise me?");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          run(async () => { const a = await api.ask(q.trim()); setAnswer(a); speak(a.spoken); });
        }}
      >
        <input
          id="ask"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-base"
          placeholder="Ask your memory"
        />
        <Button type="submit">Ask</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {["Where did I leave my keys?", "What is open with Ash?", "What do I owe Dana?"].map((s) => (
          <button key={s} className="rounded-full border border-line px-3 py-1 text-xs" onClick={() => setQ(s)}>{s}</button>
        ))}
      </div>
      {answer && (
        <Section title={answer.grounded ? "Answer, with proof" : "Answer"}>
          <Card className="flex flex-col gap-2">
            <p>{answer.answer}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => speak(answer.spoken)}>Speak</Button>
            </div>
          </Card>
          {answer.sources.map((m) => <MomentCard key={m.id} m={m} people={data.people} />)}
          <p className="text-xs text-muted">Receipt {answer.receipt_id}</p>
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Receipts
export function ReceiptsTab({ data, run }: { data: CortexData; run: Run }) {
  if (!data.receipts.length) return <Empty>No receipts yet.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {data.receipts.map((r) => {
        const canUndo = r.action_id && r.undo.available && r.undo.until && Date.parse(r.undo.until) > Date.now();
        return (
          <Card key={r.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="rounded bg-line px-1.5">{r.kind}</span>
              <span>{time(r.created_at)}</span>
            </div>
            <p className="text-sm">{r.summary}</p>
            <p className="text-xs text-muted">Proof: {r.source_moment_ids.length} source moment(s)</p>
            {canUndo && (
              <div>
                <Button variant="ghost" className="min-h-8 text-xs" onClick={() => run(() => api.undoAction(r.action_id!))}>
                  Undo (until {new Date(r.undo.until!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })})
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Privacy
export function PrivacyTab({ data, run }: { data: CortexData; run: Run }) {
  const state = data.privacy?.state;
  const options = [
    { id: "capturing", label: "Capturing", hint: "Cortex remembers what it hears and sees." },
    { id: "paused", label: "Paused", hint: "Nothing is captured until you resume." },
    { id: "off_record", label: "Off the record", hint: "Nothing is stored, even if heard." },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <Section title="Capture">
        {options.map((o) => (
          <Card key={o.id} className={`flex items-center justify-between gap-3 ${state === o.id ? "border-accent" : ""}`}>
            <div>
              <p className="font-medium">{o.label}</p>
              <p className="text-xs text-muted">{o.hint}</p>
            </div>
            <Button variant={state === o.id ? "primary" : "ghost"} onClick={() => run(() => api.setPrivacy(o.id))} disabled={state === o.id}>
              {state === o.id ? "On" : "Use"}
            </Button>
          </Card>
        ))}
      </Section>
      <p className="text-sm text-muted">Delete any moment from the Timeline tab. Deleting also removes promises found in it.</p>
    </div>
  );
}
