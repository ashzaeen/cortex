"use client";
// Loads everything the dashboard shows, and refreshes it whenever /api/events reports a change.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Action, type Call, type DemoState, type Mode, type Moment, type Person, type PrivacyState, type Promise_, type Receipt } from "./api";
import { demoEngine } from "./demo";

export type FeedItem = { id: string; at: string; type: string; text: string };

export type CortexData = {
  moments: Moment[];
  people: Person[];
  promises: Promise_[];
  actions: Action[];
  receipts: Receipt[];
  privacy: PrivacyState | null;
  modes: Mode[];
  demo: DemoState | null;
  /** The call in progress. null = none; undefined = this backend has no GET /calls/current (use the event feed). */
  call: Call | null | undefined;
};

const empty: CortexData = { moments: [], people: [], promises: [], actions: [], receipts: [], privacy: null, modes: [], demo: null, call: undefined };

const EVENT_TYPES = [
  "moment.created", "moment.deleted", "person.created", "promise.proposed", "promise.confirmed",
  "action.proposed", "action.updated", "receipt.created", "privacy.changed", "mode.changed", "call.started", "call.ended",
  "demo.step", "person.updated", // mock only (person.updated is proposed in #43)
];

function describe(type: string, d: Record<string, unknown>): string {
  switch (type) {
    case "moment.created": return `Heard (${d.source}): "${d.transcript ?? d.caption ?? "snapshot"}"`;
    case "person.created": return `New contact: ${d.name}${d.company ? ` from ${d.company}` : ""}`;
    case "person.updated": return `Met again: ${d.name}${d.company ? ` from ${d.company}` : ""}`;
    case "promise.proposed": return `Promise detected: ${d.what}. Confirm it below.`;
    case "promise.confirmed": return `Added to Waiting on: ${d.what}`;
    case "action.proposed": return `Suggested: ${d.title ?? "an action"}`;
    case "action.updated": return `${d.title ?? "Action"}: ${String(d.status).replace("_", " ")}`;
    case "receipt.created": return String(d.summary ?? "New receipt");
    case "privacy.changed": return `Capture is now ${String(d.state).replace("_", " ")}`;
    case "mode.changed": return `Mode is now ${d.name}`;
    case "moment.deleted": return "Deleted a moment";
    case "call.started": return "FaceTime call started";
    case "call.ended": return "FaceTime call ended";
    default: return type;
  }
}

export function useCortex() {
  const [data, setData] = useState<CortexData>(empty);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [moments, people, promises, actions, receipts, privacy, modes] = await Promise.all([
        api.moments(), api.people(), api.promises(), api.actions(), api.receipts(), api.privacy(), api.modes(),
      ]);
      const demo = await api.demo.state().catch(() => null); // only the mock has a demo driver
      // A page opened mid-call still shows "On Call". A backend without the endpoint leaves it undefined.
      const call = await api.currentCall().then((r) => r.call).catch(() => undefined);
      setData({ moments: moments.items, people: people.items, promises: promises.items, actions: actions.items, receipts: receipts.items, privacy, modes: modes.items, demo, call });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot load data.");
    }
  }, []);

  // Coalesce a burst of events into one refresh.
  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 150);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onEvent = (t: string, msg: { at: string; data?: Record<string, unknown> }) => {
      if (t === "demo.step") {
        if (msg.data?.index === 0) setFeed([]); // demo reset
      } else {
        const item = { id: `e${seq.current++}`, at: msg.at, type: t, text: describe(t, msg.data ?? {}) };
        setFeed((f) => [item, ...f].slice(0, 50));
      }
      refreshSoon();
    };

    // /demo: events come straight from the in-tab engine instead of /api/events.
    const engine = demoEngine();
    if (engine) {
      setConnected(true);
      const off = engine.subscribe((e) => { if (EVENT_TYPES.includes(e.type)) onEvent(e.type, e as { at: string; data?: Record<string, unknown> }); });
      return () => {
        off();
        if (timer.current) clearTimeout(timer.current);
      };
    }

    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    for (const t of EVENT_TYPES) {
      es.addEventListener(t, (ev) => {
        try {
          onEvent(t, JSON.parse((ev as MessageEvent).data));
        } catch {
          /* ignore malformed events */
        }
      });
    }
    return () => {
      es.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, refreshSoon]);

  return { data, feed, connected, error, refresh };
}
