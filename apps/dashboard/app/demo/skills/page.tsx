"use client";
// /demo/skills: the Skills sheet on the in-browser demo engine, for reviewing it without the dock.
import { useState } from "react";
import { Ambient } from "@/components/brass/Ambient";
import { SkillsLive } from "@/components/brass/skills/SkillsLive";
import { SkillsSheet } from "@/components/brass/skills/SkillsSheet";
import { Button } from "@/components/brass/primitives";
import { ToastProvider } from "@/components/brass/Toast";
import { useCortex } from "@/lib/useCortex";
import type { SkillId } from "@/lib/skills-api";

function Page() {
  const { data, refresh } = useCortex();
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<SkillId>("network");
  return (
    <>
      <Ambient mode="focus" seed={{ glintX: 0.6, glintY: 0.4, brass: 0.5, deep: 0.5 }} paused={false} pullKey="" />
      <main className="relative z-[1] flex min-h-dvh items-center justify-center p-6">
        <Button variant="primary" onClick={() => setOpen(true)}>Open Skills</Button>
      </main>
      <SkillsSheet open={open} onClose={() => setOpen(false)} data={data} refresh={refresh} initial={tab} onOpenMoment={() => {}} onOpenPeople={() => {}} onOpenWaiting={() => {}} />
      <SkillsLive onOpenSkill={(id) => { setTab(id); setOpen(true); }} />
    </>
  );
}
export default function SkillsStyleguide() { return <ToastProvider><Page /></ToastProvider>; }
