"use client";
// Skills that speak up on their own: overdue nudges and the automatic pre-meeting brief are spoken and toasted;
// a proactive offer shows as a chip above the dock with Yes and Not Now. Nothing here acts without a tap.
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { friendly } from "@/lib/errors";
import { skillsApi, type Offer } from "@/lib/skills-api";
import { useSkillEvents } from "@/lib/useSkillEvents";
import { Button } from "../primitives";
import { speak } from "../sheets";
import { useToast } from "../Toast";

export function SkillsLive({ onOpenSkill }: { onOpenSkill?: (id: "waiting" | "brief" | "world") => void }) {
  const toast = useToast();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);

  useSkillEvents(useCallback((type, d) => {
    if (type === "nudge.due") { const t = String(d.spoken ?? ""); speak(t); toast({ text: t }); }
    if (type === "brief.due") { const t = String(d.spoken ?? ""); speak(t); toast({ text: `Heads up: ${d.event_title}. ${t}` }); }
    if (type === "skill.offer") setOffer(d as unknown as Offer);
  }, [toast]));

  async function yes() {
    if (!offer) return;
    setBusy(true);
    try { const r = await skillsApi.acceptOffer(offer.id, { source: "glasses" }); speak(r.spoken); toast({ text: r.spoken }); onOpenSkill?.("world"); }
    catch (e) { toast({ text: friendly(e, "Couldn't look right now."), tone: "danger" }); }
    finally { setBusy(false); setOffer(null); }
  }
  async function no() { const o = offer; setOffer(null); if (o) skillsApi.dismissOffer(o.id).catch(() => {}); }

  return (
    <AnimatePresence>
      {offer && (
        <motion.div key={offer.id} role="group" aria-label="Cortex offers help" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          className="glass glass--float fixed inset-x-4 z-40 mx-auto flex max-w-[480px] flex-col gap-3 p-4"
          style={{ bottom: "calc(max(12px, var(--safe-bottom)) + var(--dock-h) + 16px)" }}>
          <p className="font-semibold">{offer.text}</p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={yes} disabled={busy}>{busy ? "Looking" : "Yes, Explain"}</Button>
            <Button variant="ghost" onClick={no}>Not Now</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
