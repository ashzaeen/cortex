"use client";
// The Skills sheet (design.md 11.18): one scrolling pill strip, one panel per skill. Opens from the Skills segment
// of the dock. People, Waiting on and Brief are the first three tabs; the rest look or listen.
import { BookOpen, Compass, Hourglass, Languages, Presentation, Sparkles, Users, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { skillsApi, type SkillId, type SkillInfo } from "@/lib/skills-api";
import type { CortexData } from "@/lib/useCortex";
import { Sheet } from "../Sheet";
import { BriefPanel, NetworkPanel, WaitingPanel } from "./PeoplePanels";
import { CoachPanel, ImmersionPanel, NudgePanel, TranslatePanel, WorldPanel } from "./ViewPanels";

const ICON = { network: Users, waiting: Hourglass, brief: Presentation, world: Compass, translate: Languages, immersion: BookOpen, nudge: Sparkles, coach: Wrench } as const;
const ORDER: SkillId[] = ["network", "waiting", "brief", "world", "translate", "immersion", "nudge", "coach"];

type Props = {
  open: boolean; onClose: () => void; data: CortexData; refresh: () => void; initial?: SkillId;
  onOpenMoment: (id: string) => void; onOpenPeople: () => void; onOpenWaiting: () => void;
};

export function SkillsSheet({ open, onClose, data, refresh, initial = "network", onOpenMoment, onOpenPeople, onOpenWaiting }: Props) {
  const [tab, setTab] = useState<SkillId>(initial);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setTab(initial); skillsApi.list().then((r) => setSkills(r.items)).catch(() => {}); } }, [open, initial]);
  useEffect(() => { strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest" }); }, [tab, open]);
  const skill = skills.find((s) => s.id === tab);
  const common = { skill, data, refresh };

  function onKey(e: React.KeyboardEvent) {
    const i = ORDER.indexOf(tab);
    const to = e.key === "ArrowRight" ? ORDER[(i + 1) % ORDER.length] : e.key === "ArrowLeft" ? ORDER[(i + ORDER.length - 1) % ORDER.length] : null;
    if (to) { e.preventDefault(); setTab(to); strip.current?.querySelector<HTMLElement>(`#skill-tab-${to}`)?.focus(); }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Skills" title="Skills" detent="full" matte>
      <div className="flex flex-col gap-5">
        <div ref={strip} role="tablist" aria-label="Skills" onKeyDown={onKey} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
          {ORDER.map((id) => {
            const Icon = ICON[id]; const on = tab === id; const s = skills.find((x) => x.id === id);
            return (
              <button key={id} id={`skill-tab-${id}`} role="tab" type="button" aria-selected={on} aria-controls="skill-panel" tabIndex={on ? 0 : -1} onClick={() => setTab(id)}
                className={`press inline-flex min-h-11 flex-none items-center gap-2 whitespace-nowrap rounded-pill border px-4 text-[0.8125rem] font-medium ${on ? "border-brass bg-brass-wash text-brass" : "border-transparent bg-fill-soft text-text-2 hover:bg-fill-press"}`}>
                <Icon aria-hidden="true" size={16} />{s?.name ?? id}
              </button>
            );
          })}
        </div>
        <div id="skill-panel" role="tabpanel" aria-labelledby={`skill-tab-${tab}`} key={tab} className="rise">
          {tab === "network" && <NetworkPanel {...common} onOpenPeople={onOpenPeople} />}
          {tab === "waiting" && <WaitingPanel {...common} onOpenWaiting={onOpenWaiting} />}
          {tab === "brief" && <BriefPanel {...common} />}
          {tab === "world" && <WorldPanel skill={skill} onOpenMoment={onOpenMoment} />}
          {tab === "translate" && <TranslatePanel skill={skill} />}
          {tab === "immersion" && <ImmersionPanel skill={skill} onOpenMoment={onOpenMoment} />}
          {tab === "nudge" && <NudgePanel skill={skill} />}
          {tab === "coach" && <CoachPanel skill={skill} />}
        </div>
      </div>
    </Sheet>
  );
}
