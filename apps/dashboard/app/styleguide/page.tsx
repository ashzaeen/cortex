"use client";
// /styleguide (design.md 21): every Brass component in its states, on static example data.
import type { Action, Moment, Person, Promise_ } from "@/lib/api";
import { shortIds } from "@/lib/format";
import { Ambient } from "@/components/brass/Ambient";
import { ProofCard, ProofRow } from "@/components/brass/AskPanel";
import { MomentRow } from "@/components/brass/TimelinePanel";
import { Button, Chip, Frame, IconButton, Label, ProgressRing, Tag } from "@/components/brass/primitives";
import { Mic } from "lucide-react";

const now = new Date();
const at = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
const moments: Moment[] = [
  { id: "mom_ex_1", ts: at(30), source: "glasses", mode: "focus", transcript: "This is Ash from Acme.", caption: "A booth with an Acme banner.", snapshot_url: "fixtures/snapshots/placeholder-booth.svg", place: "Expo hall", person_ids: ["per_ash"], off_record: false },
  { id: "mom_ex_2", ts: at(28), source: "glasses", mode: "focus", transcript: "I'll send you the deck Friday.", caption: null, snapshot_url: null, place: null, person_ids: ["per_ash"], off_record: false },
  { id: "mom_ex_3", ts: at(12), source: "phone", mode: "student", transcript: null, caption: "Whiteboard: API sketch", snapshot_url: "fixtures/snapshots/placeholder-whiteboard.svg", place: null, person_ids: [], off_record: false },
];
const people: Person[] = [{ id: "per_ash", name: "Ash", company: "Acme", role: null, consent: "introduction", introduced_moment_id: "mom_ex_1", topics: [], notes: null, name_confidence: 0.95 }];
const promises: Promise_[] = [{ id: "prm_ex", direction: "waiting_on", person_id: "per_ash", what: "Send the deck", due: { date: null, inferred: false, text: "Friday" }, status: "confirmed", source_moment_id: "mom_ex_2" }];
const ids = shortIds(moments);
void ({} as Action);

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="glass flex flex-col gap-4 p-5 md:p-8"><Label as="h2">{title}</Label>{children}</section>;
}

export default function Styleguide() {
  return (
    <>
      <Ambient mode="focus" seed={{ glintX: 0.6, glintY: 0.4, brass: 0.5, deep: 0.5 }} paused={false} pullKey="" />
      <main className="relative z-[1] mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-10 md:px-6">
        <h1 className="t-title">Brass Styleguide</h1>
        <Block title="Type">
          <p className="t-display">“I’ll send you the deck Friday.”</p>
          <p className="t-question">What did Ash promise me?</p>
          <p className="t-title">Draft a Follow-Up to Ash</p>
          <p className="t-headline">Headline - Manrope 600</p>
          <p>Body - Manrope 400, 16px. Never below 16 in inputs.</p>
          <p className="t-callout">Callout - secondary body text.</p>
          <p className="t-footnote">Footnote - helper text.</p>
          <span className="t-label">Label - mono uppercase</span>
          <span className="t-data text-brass">m2 - 14:16:04 - glasses mic</span>
        </Block>
        <Block title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Approve and Send</Button>
            <Button variant="secondary">Undo</Button>
            <Button variant="ghost">Save Draft</Button>
            <Button variant="destructive">Delete Moment</Button>
            <IconButton label="Mic"><Mic size={20} strokeWidth={1.5} /></IconButton>
            <ProgressRing /><ProgressRing done />
          </div>
        </Block>
        <Block title="Chips and tags">
          <div className="flex flex-wrap items-center gap-3">
            <Chip>All</Chip><Chip selected>Network</Chip><Chip>Snapshot</Chip>
            <Tag>Network</Tag><Tag tone="muted">Due Fri</Tag><Tag tone="danger">Overdue Wed</Tag><Tag tone="ok">Synced</Tag>
          </div>
        </Block>
        <Block title="Tally ring">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2"><span className="tally-ring" /> <span className="t-data">REC / FOCUS</span></span>
            <span className="flex items-center gap-2"><span className="tally-ring" data-state="paused" /> <span className="t-data text-text-3">PAUSED</span></span>
            <span className="flex items-center gap-2"><span className="tally-ring" data-state="error" /> <span className="t-data text-danger">API OFFLINE</span></span>
          </div>
        </Block>
        <Block title="Frames">
          <div className="flex flex-wrap gap-4">
            <Frame src="/api/fixtures/snapshots/placeholder-booth.svg" alt="" className="w-40" ratio="16 / 10" />
            <Frame src="/api/fixtures/snapshots/placeholder-booth.svg" alt="" selected className="w-40" ratio="16 / 10" />
            <Frame src={null} alt="" className="w-40" ratio="16 / 10" />
          </div>
        </Block>
        <Block title="Proof card">
          <ProofCard m={moments[1]} sid="m2" note="Ash owes you: send the deck, due Friday." />
          <ProofCard m={moments[2]} sid="m3" />
          <ProofRow m={moments[1]} sid="m2" note="Ash owes you: send the deck, due Friday." />
        </Block>
        <Block title="Moment rows">
          {moments.map((m, i) => <MomentRow key={m.id} m={m} sid={ids.get(m.id)!} tag={["Network", "Waiting On", "Snapshot"][i]} selected={i === 1} onSelect={() => {}} onOpen={() => {}} onDelete={() => {}} />)}
          <p className="t-footnote">Waiting on: {people[0].name}, {promises[0].what.toLowerCase()}</p>
        </Block>
        <Block title="Loading">
          <div className="skeleton shimmer h-9 w-11/12" />
          <span className="t-label">Searching 14 moments</span>
        </Block>
        <Block title="Matte">
          <div className="matte p-5"><p className="t-callout">Matte is for long reading: receipts, settings lists.</p></div>
        </Block>
      </main>
    </>
  );
}
