"use client";
// Listens for the skills' own live events on a separate stream, so it never touches the main feed in useCortex.
import { useEffect, useRef } from "react";
import { demoFallbackEngine, eventsUrl } from "./demo";
import { SKILL_EVENTS, type SkillEvent } from "./skills-api";

export function useSkillEvents(on: (type: SkillEvent, data: Record<string, unknown>) => void) {
  const handler = useRef(on);
  useEffect(() => { handler.current = on; });
  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    demoFallbackEngine().then((engine) => {
      if (cancelled) return;
      if (engine) {
        stop = engine.subscribe((e) => { if ((SKILL_EVENTS as readonly string[]).includes(e.type)) handler.current(e.type as SkillEvent, (e.data ?? {}) as Record<string, unknown>); });
        return;
      }
      const es = new EventSource(eventsUrl());
      for (const t of SKILL_EVENTS) {
        es.addEventListener(t, (ev) => {
          try { handler.current(t, (JSON.parse((ev as MessageEvent).data).data ?? {}) as Record<string, unknown>); } catch { /* ignore malformed events */ }
        });
      }
      stop = () => es.close();
    });
    return () => { cancelled = true; stop(); };
  }, []);
}
