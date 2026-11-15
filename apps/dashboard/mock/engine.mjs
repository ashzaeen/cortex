// The stateful Cortex mock as a plain engine: no Node APIs, so it runs behind the HTTP mock
// (mock/server.mjs, `make dev`) and inside the browser for the public demo (/demo, lib/demo.ts).
// It fakes the backend's behaviour with simple rules; the real backend replaces it.
//
//   const engine = createEngine({ load, ... });
//   engine.handle("GET", "/moments?limit=10")      -> { status, body }
//   engine.subscribe(({ type, at, data }) => ...)  -> unsubscribe
//
// Mock-only extras (not in the contract): GET /_demo, POST /_demo/next, /_demo/play, /_demo/reset,
// and the events `demo.step` and `person.updated` (re-meeting a known person; proposed in #43).

import { createSkills } from "./skills.mjs";

const UNDO_WINDOW_MS = 60_000;
const STOP = new Set("a an the and or of to in on at for with me my i you your what did is are was were who whom about from by this that it do does any open where when".split(" "));
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;
const ACTION_TYPES = ["follow_up_email", "flashcards", "reminder", "read_aloud", "calendar_event", "notes", "message", "caregiver_summary", "expense"];

/**
 * @param {object} opts
 * @param {() => object} opts.load        returns fresh data: { moments, people, promises, actions, receipts, modes }
 * @param {string} [opts.anchor]          "YYYY-MM-DD": the profile's "today". Shifts every date so it lands on the real today.
 * @param {boolean} [opts.suggestions]    seed one suggestion per mode from the backend fixtures (fixture ids)
 * @param {{name: string, email: string}} [opts.owner]  the demo persona, used to sign emails
 * @param {{booth?: string, card?: string}} [opts.assets] snapshots used by the Ash demo script
 */
export function createEngine({ load, anchor = null, suggestions = false, owner = null, assets = {} }) {
  let db;
  let playing = null;
  const listeners = new Set();
  const now = () => new Date().toISOString();
  const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  const activeMode = () => db.modes.find((m) => m.active)?.id ?? "focus";
  const booth = assets.booth ?? "fixtures/snapshots/placeholder-booth.svg";
  const card = assets.card ?? booth;

  function emit(type, data) {
    const msg = { type, at: now(), data };
    for (const fn of listeners) fn(msg);
  }

  // ------------------------------------------------------------ state
  function fresh() {
    const d = JSON.parse(JSON.stringify(load()));
    if (anchor) rebase(d, anchor);
    d.modes = d.modes.map(withModeDefaults);
    return {
      ...d, privacy: { state: "capturing", since: now() }, demoIndex: 0, calls: {}, activeCall: null,
      routines: [], suggestion: null, dismissedAt: {}, lists: { shopping: [], expenses: [] },
      caregiver: { consent: false, name: null, email: null, send_at: "20:00", consented_at: null, last_sent_at: null },
    };
  }

  // Older mode files (the demo profile) lack the v2 fields; fill them from the preset defaults.
  const PRESET = {
    focus: { description: "For work: never lose a decision, promise or idea.", allowed_actions: ["follow_up_email", "calendar_event", "reminder", "notes", "message"], retention_days: null },
    student: { description: "For lectures and labs: notes, flashcards and deadlines.", allowed_actions: ["flashcards", "notes", "calendar_event"], retention_days: null },
    life: { description: "For every day: where things are and what to do next.", allowed_actions: ["reminder", "calendar_event", "message", "expense"], retention_days: null },
    assist: { description: "Support for reading, finding and routines. Not a medical device.", allowed_actions: ["read_aloud", "caregiver_summary"], retention_days: 7 },
  };
  function withModeDefaults(m) {
    const p = PRESET[m.id] ?? {};
    const v1 = m.auto_suggest === undefined && PRESET[m.id]; // a pre-v2 built-in: take the preset's actions
    return { description: p.description ?? "", auto_suggest: true, auto_run: [], retention_days: p.retention_days ?? null, ...m,
      allowed_actions: v1 ? p.allowed_actions : m.allowed_actions ?? [] };
  }
  const SLUG = /^[a-z][a-z0-9_-]{1,31}$/;
  // ACT-4: only these low-risk types can run without asking, and only when the mode also allows them.
  const AUTO_ELIGIBLE = ["reminder", "notes", "flashcards", "expense"];
  const autoRuns = (kind, modeId = null) => {
    const m = db.modes.find((x) => x.id === (modeId ?? activeMode()));
    return !!m && AUTO_ELIGIBLE.includes(kind) && (m.auto_run ?? []).includes(kind) && allows(kind, m.id);
  };
  const allows = (kind, modeId = null) => {
    const m = db.modes.find((x) => x.id === (modeId ?? activeMode()));
    return !m || (m.auto_suggest !== false && (m.allowed_actions ?? []).includes(kind));
  };

  // Shift every timestamp by whole days so the profile's anchor day becomes today (local time).
  // Times of day stay put; weekday words in transcripts ("by Friday") are recomputed into due dates.
  function rebase(d, anchorDay) {
    const [y, m, day] = anchorDay.split("-").map(Number);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let delta = Math.round((today - new Date(y, m - 1, day)) / DAY_MS) * DAY_MS;
    // Never put a moment in the future: early in the day, the anchor day's later moments would land
    // after "now", so move the whole week back a day until the newest moment is in the past.
    const newest = Math.max(...d.moments.map((x) => Date.parse(x.ts)).filter(Number.isFinite));
    while (Number.isFinite(newest) && newest + delta > Date.now()) delta -= DAY_MS;
    const shift = (iso) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : iso);
    const shiftDate = (s) => (s ? localDate(new Date(new Date(`${s}T12:00:00`).getTime() + delta)) : s);
    for (const x of d.moments) x.ts = shift(x.ts);
    for (const r of d.receipts) { r.created_at = shift(r.created_at); r.undo.until = shift(r.undo.until); }
    for (const p of d.promises) {
      const src = d.moments.find((x) => x.id === p.source_moment_id);
      const said = src && p.due.text && dueFrom(p.due.text, src.ts);
      p.due.date = said?.date ?? shiftDate(p.due.date);
    }
  }

  // Mode suggestions (design decision D18): each mode suggests its own action. Built from the
  // backend fixtures' ids; a demo profile ships its own suggestions in actions.json instead.
  function seedModeSuggestions() {
    const slide = db.moments.find((m) => m.id === "mom_seed_006");
    const board = db.moments.find((m) => m.id === "mom_seed_005");
    const sam = db.promises.find((p) => p.id === "prm_seed_001");
    const add = (a) => db.actions.push({ id: id("act"), status: "proposed", ...a });
    if (slide) add({ type: "flashcards", mode: "student", person_id: null, title: "Turn the lecture slide into flashcards",
      summary: "Cards from the CSE 3310 project schedule you captured, ready to review tonight.", source_moment_ids: [slide.id] });
    if (sam) add({ type: "reminder", mode: "life", person_id: sam.person_id, title: "Remind me about Sam's application link",
      summary: "Sam promised the internship application link by Wednesday. A reminder tomorrow morning, with a nudge if nothing has arrived.", source_moment_ids: [sam.source_moment_id] });
    if (board) add({ type: "read_aloud", mode: "assist", person_id: null, title: "Read the whiteboard aloud",
      summary: "Reads the text on the Initech whiteboard snapshot in order, then offers to describe the diagram.", source_moment_ids: [board.id] });
  }

  function reset() {
    if (playing) { clearInterval(playing); playing = null; }
    db = fresh();
    if (suggestions) seedModeSuggestions();
  }

  // ------------------------------------------------------------ calls (D-10, mirrors apps/backend/core/calls.py)
  const MAX_CALL_MS = 6 * 60 * 1000; // Chert caps calls at 5 minutes; no end after 6 counts as ended
  function callEnd(callId, at = now()) {
    const c = db.calls[callId];
    if (!c) return null;
    if (!c.ended_at) { c.ended_at = at; emit("call.ended", { ...c }); }
    if (db.activeCall === callId) db.activeCall = null;
    return c;
  }
  function callStart(callId) {
    const cur = db.activeCall && db.calls[db.activeCall];
    if (cur && Date.now() - Date.parse(cur.started_at) > MAX_CALL_MS) callEnd(cur.call_id, new Date(Date.parse(cur.started_at) + MAX_CALL_MS).toISOString());
    if (db.activeCall === callId) return db.calls[callId]; // idempotent
    if (db.activeCall) callEnd(db.activeCall); // one call at a time
    const c = { call_id: callId, started_at: now(), ended_at: null };
    db.calls[callId] = c; db.activeCall = callId;
    emit("call.started", { ...c });
    return c;
  }
  function callCurrent() {
    const cur = db.activeCall && db.calls[db.activeCall];
    if (cur && Date.now() - Date.parse(cur.started_at) > MAX_CALL_MS) { callEnd(cur.call_id, new Date(Date.parse(cur.started_at) + MAX_CALL_MS).toISOString()); return null; }
    return cur || null;
  }

  // ------------------------------------------------------------ skills (fake rules)
  function dueFrom(text, fromIso) {
    const m = text.toLowerCase().match(/\b(today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (!m) return { date: null, inferred: false, text: null };
    const d = new Date(fromIso);
    if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
    else if (m[1] !== "today" && m[1] !== "tonight") {
      let diff = (DAYS.indexOf(m[1]) - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
    }
    return { date: localDate(d), inferred: false, text: m[0][0].toUpperCase() + m[0].slice(1) };
  }

  // Modes: the wearer's voice can switch mode; a moment is tagged and may suggest another mode.
  const SWITCH = /\b(?:switch|change|go|turn|move|put me)\s+(?:back\s+)?(?:to|into|in|on)\s+(?:the\s+)?([a-z][\w -]{1,30}?)\s+mode\b|\b([a-z][\w-]{1,30})\s+mode\s+(?:on|please)\b|^\s*([a-z][\w-]{1,30})\s+mode[.!]?\s*$/i;
  const DECISION = /\b(?:we(?:'ve| have)? decided|(?:the )?decision is|let'?s go with|we(?:'ll| will) go with|we agreed|agreed to|final call|we're going with|we are going with)\b/i;
  const CUES = {
    student: { lecture: 2, professor: 2, syllabus: 2, homework: 2, "problem set": 2, midterm: 2, quiz: 1, exam: 1, class: 1, slide: 1, slides: 1, lab: 1, chapter: 1 },
    life: { grocery: 2, groceries: 2, "shopping list": 2, keys: 1, wallet: 1, dinner: 1, errand: 2, receipt: 1, kitchen: 1, laundry: 2 },
    assist: { "read this": 2, "what's in front of me": 2, "where is the door": 2, medicine: 2, medication: 2, "read the label": 2, menu: 1 },
    focus: { meeting: 2, agenda: 2, standup: 2, client: 1, deck: 1, roadmap: 2, sprint: 2, "action item": 2, quarterly: 1, whiteboard: 1 },
  };
  const REASONS = { student: "Sounds like a lecture.", life: "Sounds like errands.", assist: "Sounds like you want help reading or finding.", focus: "Sounds like a meeting." };
  const modeNamed = (word) => { const w = (word ?? "").trim().toLowerCase(); return db.modes.find((x) => x.id === w || x.name.toLowerCase() === w); };
  function switchCommand(text) {
    const m = (text ?? "").match(SWITCH);
    return m ? modeNamed(m[1] ?? m[2] ?? m[3])?.id ?? null : null;
  }
  function activateMode(mode) {
    for (const x of db.modes) x.active = x === mode;
    db.suggestion = null;
    emit("mode.changed", mode);
    return mode;
  }
  function suggestMode(moment) {
    const text = `${moment.transcript ?? ""} ${moment.caption ?? ""}`.toLowerCase();
    if (!text.trim() || switchCommand(moment.transcript)) return;
    const score = (m) => Object.entries(CUES[m]).reduce((s, [w, n]) => s + (text.includes(w) ? n : 0), 0);
    const best = Object.keys(CUES).reduce((a, b) => (score(b) > score(a) ? b : a));
    const cool = Date.now() - Date.parse(db.dismissedAt[best] ?? 0) < 30 * 60_000;
    if (score(best) < 2 || best === activeMode() || !modeNamed(best) || db.suggestion?.mode_id === best || cool) return;
    db.suggestion = { mode_id: best, reason: REASONS[best], moment_id: moment.id, at: now() };
    emit("mode.suggested", db.suggestion);
  }
  // Student: "<quiz|exam|...> due <weekday>" proposes the deadline and the evening-before study block.
  function studentDeadline(moment) {
    if (moment.mode !== "student" || !allows("calendar_event", "student")) return;
    const m = (moment.transcript ?? "").toLowerCase().match(/\b((?:\w+ )?(?:quiz|exam|midterm|final|homework|assignment|lab report|project|essay|paper))(?: is)?(?: due)?(?: on| this| next)?\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(?!\s+at\b)/);
    if (!m) return;
    const day = dueFrom(m[2], moment.ts).date;
    const what = m[1].trim().replace(/^./, (c) => c.toUpperCase());
    const mk = (title, start, end, summary) => {
      const a = { id: id("act"), type: "calendar_event", status: "proposed", mode: "student", person_id: null, title, summary,
        event: { title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), location: null, description: null }, source_moment_ids: [moment.id] };
      db.actions.push(a); emit("action.proposed", a);
    };
    mk(`Due: ${what}`, `${day}T09:00:00`, `${day}T09:30:00`, `Add ${what} to your calendar on ${day}.`);
    const eve = new Date(`${day}T12:00:00`); eve.setDate(eve.getDate() - 1);
    const before = localDate(eve);
    if (before > localDate(new Date())) mk(`Study for ${what}`, `${before}T18:00:00`, `${before}T19:00:00`, `Block an hour at 6:00 PM the evening before to study for ${what}.`);
  }

  function ingest(body) {
    const out = ingestCore(body);
    if (out.moment) { suggestMode(out.moment); studentDeadline(out.moment); }
    return out;
  }

  function ingestCore(body) {
    if (db.privacy.state !== "capturing") return { error: [409, "capture_paused", `Capture is ${db.privacy.state}; nothing was stored.`] };
    if (!body || !body.ts || !body.source) return { error: [400, "bad_request", "ts and source are required."] };
    if (body.mode && !SLUG.test(body.mode)) return { error: [400, "bad_request", "mode must be a short lowercase slug."] };
    const to = switchCommand(body.transcript);
    if (to && to !== activeMode()) activateMode(modeNamed(to));
    const transcript = body.transcript ?? (body.audio_base64 ? "(audio clip; the mock does not transcribe)" : null);
    const snapshot = body.snapshot_url ?? (body.snapshot_base64 ? `data:image/jpeg;base64,${body.snapshot_base64}` : null);
    const moment = {
      id: id("mom"), ts: body.ts, source: body.source, mode: body.mode ?? activeMode(),
      transcript, caption: body.caption ?? (snapshot ? "Snapshot (the mock does not caption images)" : null),
      snapshot_url: snapshot, place: body.place ?? null, person_ids: [], off_record: false,
    };
    if (DECISION.test(transcript ?? "")) moment.tags = ["decision"];
    db.moments.push(moment);

    // Network skill: "This is <Name> from <Company>"
    const intro = transcript?.match(/\b[Tt]his is ([A-Z][\w'-]*(?: [A-Z][\w'-]*)?) from ([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)?)/);
    let person = null;
    if (intro) {
      person = db.people.find((p) => p.name.toLowerCase() === intro[1].toLowerCase());
      if (person) {
        // Met again: link the moment to the existing card; the card keeps its first meeting as proof.
        moment.person_ids.push(person.id);
        emit("moment.created", moment);
        emit("person.updated", person);
        return { moment };
      }
      person = {
        id: `per_${intro[1].toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, name: intro[1], company: intro[2].replace(/[.,]$/, ""),
        role: null, consent: "introduction", introduced_moment_id: moment.id, topics: [], notes: null, name_confidence: 0.92,
      };
      db.people.push(person);
      moment.person_ids.push(person.id);
      emit("moment.created", moment);
      emit("person.created", person);
      return { moment };
    }
    // Otherwise link to the person seen most recently in the last 10 minutes.
    const recent = [...db.moments].reverse().find((m) => m !== moment && m.person_ids.length && Math.abs(Date.parse(moment.ts) - Date.parse(m.ts)) < 600_000);
    if (recent) person = db.people.find((p) => p.id === recent.person_ids[0]);
    if (person && !moment.person_ids.includes(person.id)) moment.person_ids.push(person.id);
    emit("moment.created", moment);

    // Waiting-on tracker: "I'll send you X <day>"
    const promise = transcript?.match(/\bI(?:'ll| will) (send|share|email|get|give|intro\w*) (?:you )?(.+?)(?:\s+(?:by|on|before))?\s*(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)?[.!]?$/i);
    if (promise && person) {
      const what = `${promise[1][0].toUpperCase()}${promise[1].slice(1)} ${promise[2].replace(/^(the|a)\b/i, (w) => w.toLowerCase())}`.trim();
      const p = { id: id("prm"), direction: "waiting_on", person_id: person.id, what, due: dueFrom(transcript, moment.ts), status: "proposed", source_moment_id: moment.id };
      db.promises.push(p);
      emit("promise.proposed", p);
    }
    return { moment };
  }

  function receipt(kind, summary, sourceIds, actionId = null, undo = false) {
    const r = {
      id: id("rcp"), kind, created_at: now(), summary, action_id: actionId, source_moment_ids: sourceIds,
      undo: { available: undo, until: undo ? new Date(Date.now() + UNDO_WINDOW_MS).toISOString() : null },
    };
    db.receipts.push(r);
    emit("receipt.created", r);
    return r;
  }

  // Words, with a light stem so "park" finds "parked" and "demos" finds "demo".
  const stem = (w) => w.replace(/(ing|ed|es|s)$/, "") || w;
  const words = (s) => (s ?? "").toLowerCase().match(/[a-z0-9']+/g)?.filter((w) => !STOP.has(w) && w.length > 1).map(stem) ?? [];
  function search(q, limit = 5) {
    const qw = new Set(words(q));
    return db.moments
      .map((m) => {
        const names = m.person_ids.map((pid) => db.people.find((p) => p.id === pid)?.name ?? "").join(" ");
        // What was said counts double: it is what the user asks about.
        const said = new Set(words(m.transcript));
        const seen = new Set(words(`${m.caption} ${m.place} ${names}`));
        const score = [...qw].reduce((s, w) => s + (said.has(w) ? 1 : seen.has(w) ? 0.5 : 0), 0) / Math.max(qw.size, 1);
        return { moment: m, score: Math.round(Math.min(score, 1) * 100) / 100 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.moment.ts) - Date.parse(a.moment.ts))
      .slice(0, limit);
  }
  const fmtDue = (due) => (due.date ? `${due.text ?? ""} (${new Date(due.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`.trim() : due.text ?? "no date");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const personIn = (text) => db.people.find((p) => {
    const parts = p.name.split(" ").filter((w) => !/\.$/.test(w)); // skip titles like "Prof."
    return parts.some((w) => new RegExp(`\\b${reEsc(w)}\\b`, "i").test(text));
  });

  function ask(question) {
    const person = personIn(question);
    if (person && /promis|owe|open|waiting/i.test(question)) {
      const open = db.promises.filter((p) => p.person_id === person.id && (p.status === "confirmed" || p.status === "proposed"));
      if (open.length) {
        const first = person.name.split(" ").filter((w) => !/\.$/.test(w))[0];
        const list = open.map((p) => `${p.direction === "waiting_on" ? `${first} owes you` : `You owe ${first}`}: ${p.what.toLowerCase()}, due ${fmtDue(p.due)}`);
        const sources = open.map((p) => db.moments.find((m) => m.id === p.source_moment_id)).filter(Boolean);
        const spoken = open.length === 1 && open[0].direction === "waiting_on"
          ? `${first} promised to ${open[0].what.toLowerCase()} by ${open[0].due.text ?? "no set date"}.`
          : list.join(". ") + ".";
        const r = receipt("answer", `Answered "${question}" from ${sources.length} moment(s).`, sources.map((m) => m.id));
        return { answer: list.join("; ") + ".", spoken, grounded: true, sources, receipt_id: r.id };
      }
    }
    const hits = search(question, 3);
    if (!hits.length) {
      const r = receipt("answer", `No memory matched "${question}".`, []);
      return { answer: "I don't have anything about that in memory.", spoken: "I don't have that.", grounded: false, sources: [], receipt_id: r.id };
    }
    const top = hits[0].moment;
    const when = new Date(top.ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const r = receipt("answer", `Answered "${question}" from ${hits.length} moment(s).`, hits.map((h) => h.moment.id));
    return { answer: `On ${when}: "${top.transcript ?? top.caption}"`, spoken: top.transcript ?? top.caption ?? "", grounded: true, sources: hits.map((h) => h.moment), receipt_id: r.id };
  }

  function brief(person) {
    const moments = db.moments.filter((m) => m.person_ids.includes(person.id)).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const open = db.promises.filter((p) => p.person_id === person.id && ["proposed", "confirmed"].includes(p.status));
    if (!moments.length) return { person, spoken: `I have nothing on file about ${person.name}.`, bullets: [], open_promises: [], sources: [] };
    const first = moments[0];
    const last = moments.at(-1);
    const met = new Date(first.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const openText = open.length ? open.map((p) => (p.direction === "waiting_on" ? `${person.name} owes you ${p.what.toLowerCase()} by ${p.due.text ?? "no set date"}` : `you owe ${person.name} ${p.what.toLowerCase()}`)).join("; ") : "nothing is open";
    const bullets = [
      `${person.name}${person.company ? `, ${person.company}` : ""}; met ${met}${first.place ? ` at ${first.place}` : ""}`,
      `Last said: "${(last.transcript ?? last.caption ?? "").slice(0, 80)}"`,
      open.length ? `Open: ${open.map((p) => p.what).join("; ")}` : "Nothing open",
    ];
    const spoken = `${person.name}${person.company ? `, ${person.company}` : ""}. You met on ${met}${first.place ? ` at ${first.place}` : ""}. Most recently: ${last.transcript ?? last.caption}. Open: ${openText}.`;
    receipt("answer", `Briefed on ${person.name}.`, moments.map((m) => m.id));
    return { person, spoken, bullets, open_promises: open, sources: moments };
  }

  function proposeEmail(personId, sourceIds) {
    const person = db.people.find((p) => p.id === personId);
    if (!person) return null;
    const open = db.promises.filter((p) => p.person_id === personId && p.status === "confirmed" && p.direction === "waiting_on");
    const srcs = sourceIds?.length ? sourceIds : db.moments.filter((m) => m.person_ids.includes(personId)).map((m) => m.id);
    const first = person.name.split(" ").filter((w) => !/\.$/.test(w))[0];
    const sign = owner?.name?.split(" ")[0] ?? "Cortex user";
    const a = {
      id: id("act"), type: "follow_up_email", status: "proposed", mode: "focus", person_id: personId,
      title: `Draft a follow-up to ${first}`,
      summary: `Thanks for the chat today.${open.length ? ` You mentioned you would ${open[0].what.toLowerCase()} by ${open[0].due.text ?? "soon"}, and Cortex will watch for it.` : ""} Could we find 20 minutes next week?`,
      draft: {
        to: `${first.toLowerCase()}@${(person.company ?? "example").toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
        subject: `Great meeting you${person.company ? `, from ${person.company}` : ""}`,
        body: `Hi ${first},\n\nGreat to see you today.${open.length ? ` Looking forward to ${open[0].what.replace(/^Send /i, "").toLowerCase()} by ${open[0].due.text ?? "soon"}.` : ""}\n\nBest,\n${sign}`,
      },
      source_moment_ids: srcs.length ? srcs : [db.moments.at(-1).id],
    };
    db.actions.push(a);
    emit("action.proposed", a);
    return a;
  }

  function confirmPromise(p) {
    p.status = "confirmed";
    emit("promise.confirmed", p);
    const who = db.people.find((x) => x.id === p.person_id);
    if (p.direction === "waiting_on" && who && !db.actions.some((a) => a.type === "reminder" && a.source_moment_ids.includes(p.source_moment_id))) {
      const a = { id: id("act"), type: "reminder", status: "proposed", mode: "life", person_id: who.id,
        title: `Remind me when ${p.what.replace(/^Send /i, "").toLowerCase()} is due`,
        summary: `A reminder ${p.due.text ? `on ${p.due.text}` : "soon"} about ${p.what.toLowerCase()} from ${who.name}, with a nudge if nothing has arrived.`,
        source_moment_ids: [p.source_moment_id] };
      db.actions.push(a);
      emit("action.proposed", a);
      if (autoRuns("reminder", a.mode)) { a.auto = true; confirmAction(a, "do"); }
    }
    return p;
  }

  // Calendar, tasks, Drive and texts (ACT-5 to ACT-9): the mock never calls Google or Chert, so these
  // behave like the backend's dry run (external: null).
  const PAYLOAD = { calendar_event: "event", reminder: "task", flashcards: "doc", notes: "doc", message: "message", expense: "expense" };
  const DEFAULT_MODE = { calendar_event: "focus", reminder: "life", flashcards: "student", notes: "student", message: "life", read_aloud: "assist", expense: "life" };
  // ACT-9: a text to a person on a card, drafted from what is open with them; refused without a number.
  function proposeText(body) {
    const person = db.people.find((x) => x.id === body.person_id);
    if (!person) return err(404, "not_found", "No such person.");
    const first = person.name.split(/\s+/).filter((w, i, all) => i === all.length - 1 || !/^(?:dr|prof|professor|mr|mrs|ms|mx|miss|sir|coach)\.?$/i.test(w))[0];
    if (!person.phone) return err(400, "no_phone", `I don't have a number for ${first}. Add one on their card, then try again.`);
    const waiting = db.actions.find((a) => a.type === "message" && a.person_id === person.id && a.status === "proposed");
    if (waiting) return ok(201, waiting);
    const open = db.promises.find((x) => x.person_id === person.id && (x.status === "confirmed" || x.status === "proposed"));
    const what = open?.what.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase());
    const text = !open ? `Hi ${first}, great to meet you. Talk soon.`
      : open.direction === "waiting_on" ? `Hi ${first}, just checking in on ${what}. Let me know when it's ready.` : `Hi ${first}, a quick note on ${what}: I'll get it to you soon.`;
    const ids = [person.introduced_moment_id, open?.source_moment_id].filter((x, i, all) => x && all.indexOf(x) === i && db.moments.some((mo) => mo.id === x));
    if (!ids.length) return err(400, "bad_request", "No source moments found for this person.");
    const a = { id: id("act"), type: "message", status: "proposed", mode: activeMode(), title: `Text ${first}`, person_id: person.id,
      summary: `To ${first}: “${text}”`, message: { to: person.phone, text }, source_moment_ids: ids };
    db.actions.push(a);
    emit("action.proposed", a);
    return ok(201, a);
  }

  function proposeOther(body) {
    const key = PAYLOAD[body.type];
    if (!(body.type in DEFAULT_MODE)) return err(400, "bad_request", "Unknown action type.");
    const payload = key ? body[key] : undefined;
    const title = body.title ?? payload?.title ?? (body.type === "message" && payload?.to ? `Text ${payload.to}` : null);
    const ids = (body.source_moment_ids ?? []).filter((x) => db.moments.some((mo) => mo.id === x));
    if (!title) return err(400, "bad_request", `title is required for ${body.type}.`);
    if (!ids.length) return err(400, "bad_request", "source_moment_ids must name at least one stored moment.");
    if ((body.type === "calendar_event" || body.type === "message") && !payload) return err(400, "bad_request", `${key} is required for ${body.type}.`);
    const a = { id: id("act"), type: body.type, status: "proposed", mode: body.mode ?? DEFAULT_MODE[body.type], title,
      person_id: body.person_id ?? null, source_moment_ids: ids };
    if (body.summary) a.summary = body.summary;
    if (body.type === "expense") {
      const amount = payload?.amount ?? null;
      if (amount !== null && !(typeof amount === "number" && amount >= 0)) return err(400, "bad_request", "The amount must be a number of dollars, 0 or more.");
      a[key] = { label: String(payload?.label ?? title).trim().slice(0, 80), amount };
    } else if (key) a[key] = payload ?? (key === "task" ? { title, notes: body.summary ?? null, due: null } : { title, body: body.summary ?? title });
    db.actions.push(a);
    emit("action.proposed", a);
    return ok(201, a);
  }

  function confirmAction(a, deliver) {
    const person = db.people.find((p) => p.id === a.person_id);
    let summary;
    if (a.type === "follow_up_email") {
      a.status = deliver === "draft" ? "draft_saved" : "sent";
      summary = `${deliver === "draft" ? "Saved a draft to" : "Sent to"} ${person?.name ?? "contact"}${person?.company ? ` at ${person.company}` : ""}`;
    } else if (a.type === "message") {
      a.status = "draft_saved"; a.external = null;
      summary = `Saved the text to ${a.message.to} as a draft. (Dry run: texting is off.)`;
    } else if (a.type === "expense") {
      a.status = "done";
      const item = { id: id("itm"), list: "expenses", text: a.expense.label, amount: a.expense.amount, done: false, source_moment_id: a.source_moment_ids[0], action_id: a.id, created_at: now() };
      db.lists.expenses.push(item); emit("list.updated", listOut("expenses"));
      a.external = { provider: "cortex_list", id: item.id, url: null };
      summary = `Logged ${a.expense.amount == null ? a.expense.label : `$${a.expense.amount.toFixed(2)} for ${a.expense.label}`} to your expenses.`;
    } else {
      a.status = "done";
      if (a.type in PAYLOAD) a.external = null;
      summary = { flashcards: "Cards added to your deck", reminder: "Reminder set", read_aloud: "Reading aloud now",
        calendar_event: `Added “${a.title}” to your calendar`, notes: `Saved the notes “${a.title}”` }[a.type];
    }
    emit("action.updated", a);
    return { action: a, receipt: receipt("action", summary, a.source_moment_ids, a.id, true) };
  }

  // ------------------------------------------------------------ modes skills (fake rules, mirror apps/backend/skills)
  const text = (m) => (m.transcript ?? m.caption ?? "").trim();
  const byTime = (a, b) => Date.parse(a.ts) - Date.parse(b.ts);
  const line = (m) => ({ text: text(m), moment_id: m.id, at: m.ts });

  function recap(modeId, kind) {
    const pool = db.moments.filter((m) => !modeId || m.mode === modeId).sort(byTime);
    const session = [];
    for (const m of [...pool].reverse()) {
      if (session.length && Date.parse(session[0].ts) - Date.parse(m.ts) > 30 * 60_000) break;
      session.unshift(m);
    }
    const label = kind === "lecture" ? "lecture" : "meeting";
    if (!session.length) {
      return { kind, mode: modeId ?? null, title: `Your ${label}`, spoken: `Nothing captured yet for a ${label} recap.`, bullets: [], notes: [], decisions: [],
        follow_ups: [], auto_actions: [], started_at: null, ended_at: null, moment_count: 0, source_moment_ids: [] };
    }
    const ids = new Set(session.map((m) => m.id));
    const notes = session.filter((m) => text(m)).map(line);
    const decisions = session.filter((m) => m.tags?.includes("decision")).map(line);
    const promised = db.promises.filter((p) => ids.has(p.source_moment_id)).map((p) => ({ text: p.what, moment_id: p.source_moment_id }));
    const said = session.filter((m) => /\b(?:action item|need to|have to|i'll|i will|will send)\b/i.test(m.transcript ?? "")).map(line);
    const follow_ups = [...new Map([...promised, ...said].map((f) => [f.moment_id, f])).values()];
    const bullets = notes.slice(-4).map((n) => n.text);
    const auto_actions = db.actions.filter((a) => a.auto && ["done", "sent", "draft_saved"].includes(a.status) && a.source_moment_ids.some((i) => ids.has(i)))
      .map((a) => ({ text: [...db.receipts].reverse().find((r) => r.action_id === a.id)?.summary ?? a.title, moment_id: a.source_moment_ids.find((i) => ids.has(i)), at: session.at(-1).ts }));
    return { kind, mode: modeId ?? null, title: `Your ${label} recap`, bullets, notes, decisions, follow_ups, auto_actions, started_at: session[0].ts, ended_at: session.at(-1).ts,
      spoken: `Your ${label}: ${session.length} moment${session.length === 1 ? "" : "s"}. ${decisions.length ? `${decisions.length} decision${decisions.length === 1 ? "" : "s"}. ` : ""}${follow_ups.length ? `Open: ${follow_ups[0].text}.` : ""}`.trim(),
      moment_count: session.length, source_moment_ids: session.map((m) => m.id) };
  }

  function look(b) {
    if (!["describe", "read", "hazards", "find", "tutor"].includes(b?.task)) return err(400, "bad_request", "task must be describe, read, hazards, find or tutor.");
    if (b.task === "find" && !(b.target ?? "").trim()) return err(400, "bad_request", "target is required for find.");
    let src = b.moment_id ? db.moments.find((m) => m.id === b.moment_id) : [...db.moments].sort(byTime).reverse().find((m) => m.snapshot_url && Date.now() - Date.parse(m.ts) < 10 * 60_000);
    if (b.moment_id && !src) return err(404, "not_found", "No such moment.");
    if (!src && !b.snapshot_base64) {
      if (b.task !== "find") return err(409, "no_view", "Cortex has no recent view. Point the camera and try again.");
      const hit = search(b.target, 1)[0]?.moment;
      const msg = hit ? `Last seen ${new Date(hit.ts).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}: ${text(hit)}` : `I haven't seen ${b.target} in memory.`;
      return ok(200, { task: "find", spoken: msg, text: msg, found: !!hit, moment: hit ?? null });
    }
    const seen = src ? text(src) : "the scene in front of you";
    const out = {
      describe: [`In front of you: ${seen}.`, null], read: [`The text reads: ${seen}`, null],
      hazards: [`Nothing risky stands out near ${b.target || "you"}. The mock cannot really see.`, false],
      find: [`I can't see ${b.target} right now (the mock does not look at pictures).`, false],
      tutor: [`Let's go step by step. ${b.question ? `On "${b.question}": ` : ""}First, name what is being asked.`, null],
    }[b.task];
    return ok(200, { task: b.task, spoken: out[0], text: out[0], found: out[1], moment: src ?? null });
  }

  const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  function routineNext(r, ref = new Date()) {
    if (!r.active) return null;
    const [h, mi] = r.time.split(":").map(Number);
    for (let i = 0; i < 8; i++) {
      const d = new Date(ref); d.setDate(d.getDate() + i); d.setHours(h, mi, 0, 0);
      if (d > ref && (!r.days.length || r.days.includes(WEEK[d.getDay()]))) return d.toISOString();
    }
    return null;
  }
  const routineOut = ({ last_fired, ...r }) => ({ ...r, next_at: routineNext(r) });
  const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const validRoutine = (b) => {
    if (b.time !== undefined && !TIME.test(b.time)) return "time must be HH:MM (24-hour).";
    if (b.days !== undefined && !(Array.isArray(b.days) && b.days.every((d) => WEEK.includes(d)))) return "days must be mon..sun.";
    if (b.title !== undefined && !String(b.title).trim()) return "title cannot be empty.";
    return null;
  };
  /** Fires routines due now, once a day each. Run every 20 s by a timer, and callable from tests. */
  function tick(ref = new Date()) {
    const fired = [];
    for (const r of db.routines) {
      const [h, mi] = r.time.split(":").map(Number);
      const at = new Date(ref); at.setHours(h, mi, 0, 0);
      const day = localDate(ref);
      if (!r.active || r.last_fired === day || !(at <= ref && ref < new Date(at.getTime() + 120_000))) continue;
      if (r.days.length && !r.days.includes(WEEK[ref.getDay()])) continue;
      r.last_fired = day;
      emit("routine.due", routineOut(r));
      fired.push(routineOut(r));
    }
    return fired;
  }

  const SHARES = ["Where you were and what you did today, in a few lines", "Routine reminders you set", "Never: audio, pictures, other people's names or private notes"];
  function caregiverPreview() {
    const today = localDate(new Date());
    const ms = db.moments.filter((m) => localDate(new Date(m.ts)) === today).sort(byTime);
    const todays = db.routines.filter((r) => r.active);
    const lines = [...ms.slice(-6).map((m) => `- ${text(m).slice(0, 120)}`), ...todays.map((r) => `- Routine: ${r.title} at ${r.time}`)];
    const who = db.caregiver.name ?? "there";
    return { subject: "Today's summary from Cortex", source_moment_ids: ms.map((m) => m.id),
      body: `Hi ${who},\n\nHere is a short summary of today:\n${lines.join("\n") || "- Nothing captured yet"}\n\nSent with permission. Reply to opt out.` };
  }
  const caregiverOut = () => ({ ...db.caregiver, shares: SHARES, preview: caregiverPreview() });

  function generate(b) {
    if (!["flashcards", "notes", "read_aloud"].includes(b?.type)) return err(400, "bad_request", "type must be flashcards, notes or read_aloud.");
    const src = b.moment_id ? db.moments.find((m) => m.id === b.moment_id) : [...db.moments].sort(byTime).reverse().find((m) => text(m));
    if (!src) return err(b.moment_id ? 404 : 400, b.moment_id ? "not_found" : "nothing_found", b.moment_id ? "No such moment." : "No moment to use.");
    const title = { flashcards: "Flashcards from this moment", notes: "Notes from this moment", read_aloud: "Read this moment aloud" }[b.type];
    return proposeOther({ type: b.type, title, summary: text(src).slice(0, 300), source_moment_ids: [src.id], mode: b.mode });
  }

  // Lists (MEM-11), digest (MEM-9) and rewind (MEM-10): simple versions so the dashboard sheets have data.
  const LIST_NAMES = { shopping: "Shopping", expenses: "Expenses" };
  const listOut = (lid) => {
    const items = [...db.lists[lid]].reverse();
    return { id: lid, name: LIST_NAMES[lid], items, total: lid === "expenses" ? Math.round(items.reduce((s, i) => s + (i.amount ?? 0), 0) * 100) / 100 : null };
  };
  function digest(date) {
    const day = date || localDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return err(400, "bad_request", "date must be YYYY-MM-DD.");
    const ms = db.moments.filter((m) => localDate(new Date(m.ts)) === day).sort(byTime);
    const ids = new Set(ms.map((m) => m.id));
    const people = db.people.filter((p) => ms.some((m) => m.person_ids.includes(p.id)));
    const promises = db.promises.filter((p) => ids.has(p.source_moment_id));
    const actions = db.actions.filter((a) => a.source_moment_ids.some((x) => ids.has(x)));
    const bullets = [`${ms.length} moment${ms.length === 1 ? "" : "s"} captured`, ...(people.length ? [`Met ${people.map((p) => p.name).join(", ")}`] : []), ...(promises.length ? [`${promises.length} promise${promises.length === 1 ? "" : "s"} tracked`] : [])];
    return ok(200, { date: day, spoken: ms.length ? `${bullets.join(". ")}.` : "Nothing was captured that day.", bullets: ms.length ? bullets : [],
      moment_count: ms.length, people, promises, actions, source_moment_ids: ms.map((m) => m.id) });
  }
  function rewind(qs) {
    const hit = search(qs, 1)[0]?.moment;
    if (!hit) return { found: false, moment: null, line: null, spoken: "I couldn't find that in memory." };
    const sentence = (hit.transcript ?? "").split(/(?<=[.!?])\s+/).find((s) => words(s).some((w) => words(qs).includes(w))) ?? hit.transcript ?? null;
    return { found: true, moment: hit, line: sentence, spoken: sentence ? `You said: ${sentence}` : `I have a picture from then: ${hit.caption ?? ""}` };
  }

  // ------------------------------------------------------------ demo driver (the Ash script)
  const ashPerson = () => db.people.find((p) => p.name === "Ash");
  const DEMO = [
    { beat: "Meet", label: 'Glasses hear "This is Ash from Acme."', you: "Watch Ash's card light up.",
      run: () => ingest({ ts: now(), source: "glasses", transcript: "This is Ash from Acme.", snapshot_url: booth, place: "HackUTA expo hall" }) },
    { beat: "Promise", label: `Ash says "I'll send you the deck Friday."`, you: "Tap Track It on the promise chip.",
      run: () => ingest({ ts: now(), source: "glasses", transcript: "I'll send you the deck Friday.", snapshot_url: booth, place: "HackUTA expo hall" }) },
    { beat: "Promise", label: "Confirm the promise chip", you: "(The driver taps Track It if you have not.)",
      run: () => { const p = db.promises.find((x) => x.status === "proposed" && x.person_id === ashPerson()?.id); if (p) confirmPromise(p); } },
    { beat: "Ask", label: 'Ask "What did Ash promise me?"', you: "Ask it in Ask Your Memory.",
      run: () => ask("What did Ash promise me?") },
    { beat: "Brief", label: 'Ask "Brief me on Ash."', you: "Tap Brief Me on Ash's card in People.",
      run: () => { const p = ashPerson(); if (p) brief(p); } },
    { beat: "Act", label: "Cortex proposes a follow-up email", you: "Approve it in Focus, then try Undo.",
      run: () => { const p = ashPerson(); if (p && !db.actions.some((a) => a.type === "follow_up_email" && a.person_id === p.id && a.status === "proposed")) proposeEmail(p.id); } },
    { beat: "Act", label: "Approve and send the email", you: "(The driver approves it if you have not.)",
      run: () => { const a = db.actions.find((x) => x.type === "follow_up_email" && x.status === "proposed" && x.person_id === ashPerson()?.id); if (a) confirmAction(a, "send"); } },
    { beat: "Call", label: "FaceTime caller shows a business card", you: "Watch the call moment arrive.",
      run: () => { callStart("call_demo"); ingest({ ts: now(), source: "call", call_id: "call_demo", transcript: "Here's Ash's business card.", caption: "Business card: Ash, Product Lead, Acme, ash@acme.example", snapshot_url: card }); } },
    { beat: "Call", label: 'Caller asks "What is open with Ash?"', you: "Hear the answer from memory.",
      run: () => { ask("What is open with Ash?"); callEnd("call_demo"); } },
  ];
  const demoState = () => ({ index: db.demoIndex, total: DEMO.length, owner: owner?.name ?? null,
    steps: DEMO.map(({ beat, label, you }, i) => ({ i, beat, label, you, done: i < db.demoIndex })) });
  function demoNext() {
    if (db.demoIndex >= DEMO.length) return false;
    DEMO[db.demoIndex].run();
    db.demoIndex++;
    emit("demo.step", demoState());
    return true;
  }
  function demoPlay(ms = 2500) {
    if (playing) return;
    playing = setInterval(() => { if (!demoNext()) { clearInterval(playing); playing = null; } }, ms);
    demoNext();
  }

  const skills = createSkills({ getDb: () => db, emit, id, now, ingest });

  // ------------------------------------------------------------ routes
  const ok = (status, body) => ({ status, body });
  const err = (status, code, message) => ({ status, body: { error: { code, message } } });

  function handle(method, target, body = null) {
    const url = new URL(target, "http://mock");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const q = (k) => url.searchParams.get(k);
    const m = method.toUpperCase();
    let mm;

    if (m === "GET" && p === "/health") return ok(200, { ok: true });
    const skilled = skills.handle(m, p, q, body, { briefFor: brief });
    if (skilled) return skilled;
    if (p === "/moments" && m === "POST") {
      const out = ingest(body);
      return out.error ? err(...out.error) : ok(201, out.moment);
    }
    if (p === "/moments" && m === "GET") {
      const since = q("since"); const limit = Number(q("limit") ?? 50);
      const tag = q("tag");
      return ok(200, { items: db.moments.filter((x) => (!since || x.ts > since) && (!tag || x.tags?.includes(tag))).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit) });
    }
    if (p === "/moments/search" && m === "GET") {
      if (!q("q")) return err(400, "bad_request", "q is required.");
      return ok(200, { results: search(q("q"), Number(q("limit") ?? 5)) });
    }
    if ((mm = p.match(/^\/moments\/([^/]+)$/)) && m === "DELETE") {
      const i = db.moments.findIndex((x) => x.id === decodeURIComponent(mm[1]));
      if (i < 0) return err(404, "not_found", "No such moment.");
      const [gone] = db.moments.splice(i, 1);
      const dropped = db.promises.filter((x) => x.source_moment_id === gone.id).length;
      db.promises = db.promises.filter((x) => x.source_moment_id !== gone.id);
      for (const r of db.receipts) r.source_moment_ids = r.source_moment_ids.filter((x) => x !== gone.id);
      for (const a of db.actions) a.source_moment_ids = a.source_moment_ids.filter((x) => x !== gone.id);
      emit("moment.deleted", { id: gone.id });
      return ok(200, receipt("deletion", `Deleted 1 moment and its transcript, snapshot${dropped ? ` and ${dropped} promise(s)` : ""}.`, []));
    }
    if (p === "/ask" && m === "POST") {
      if (!body?.question || !body?.channel) return err(400, "bad_request", "question and channel are required.");
      return ok(200, ask(body.question));
    }
    if (p === "/people" && m === "GET") return ok(200, { items: db.people });
    if (p === "/people" && m === "POST") {
      if (!body?.name || !body?.introduced_moment_id) return err(400, "bad_request", "name and introduced_moment_id are required.");
      const person = { id: id("per"), name: body.name, company: body.company ?? null, role: null, consent: "introduction", introduced_moment_id: body.introduced_moment_id, topics: [], notes: null, name_confidence: 1 };
      db.people.push(person); emit("person.created", person);
      return ok(201, person);
    }
    if ((mm = p.match(/^\/people\/([^/]+)\/brief$/)) && m === "GET") {
      const person = db.people.find((x) => x.id === decodeURIComponent(mm[1]));
      return person ? ok(200, brief(person)) : err(404, "not_found", "No such person.");
    }
    if (p === "/promises" && m === "GET") {
      const f = Object.fromEntries(["status", "direction", "person_id"].map((k) => [k, q(k)]));
      return ok(200, { items: db.promises.filter((x) => Object.entries(f).every(([k, v]) => !v || x[k] === v)) });
    }
    if (p === "/promises" && m === "POST") {
      if (!body?.direction || !body?.person_id || !body?.what || !body?.source_moment_id) return err(400, "bad_request", "direction, person_id, what and source_moment_id are required.");
      const src = db.moments.find((x) => x.id === body.source_moment_id);
      const pr = { id: id("prm"), direction: body.direction, person_id: body.person_id, what: body.what, due: body.due_text ? dueFrom(body.due_text, src?.ts ?? now()) : { date: null, inferred: false, text: null }, status: "proposed", source_moment_id: body.source_moment_id };
      db.promises.push(pr); emit("promise.proposed", pr);
      return ok(201, pr);
    }
    if ((mm = p.match(/^\/promises\/([^/]+)\/confirm$/)) && m === "POST") {
      const pr = db.promises.find((x) => x.id === decodeURIComponent(mm[1]));
      return pr ? ok(200, confirmPromise(pr)) : err(404, "not_found", "No such promise.");
    }
    if (p === "/actions" && m === "GET") {
      const status = q("status"); const mode = q("mode");
      return ok(200, { items: db.actions.filter((a) => (!status || a.status === status) && (!mode || a.mode === mode)).reverse() }); // newest first, like the backend
    }
    if (p === "/actions/propose" && m === "POST") {
      if (body?.type === "message" && body.person_id && !body.message) return proposeText(body);
      if (body?.type && body.type !== "follow_up_email") return proposeOther(body);
      const a = body?.person_id && proposeEmail(body.person_id, body.source_moment_ids);
      return a ? ok(201, a) : err(400, "bad_request", "A known person_id is required.");
    }
    if ((mm = p.match(/^\/actions\/([^/]+)\/confirm$/)) && m === "POST") {
      const a = db.actions.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!a) return err(404, "not_found", "No such action.");
      if (a.status !== "proposed" && a.status !== "failed") return err(409, "not_proposed", `Action is already ${a.status}.`);
      if (body?.draft) a.draft = { ...a.draft, ...body.draft };
      for (const k of ["event", "task", "doc", "message", "expense"]) {
        if (!body?.[k] || !a[k]) continue;
        if (k === "expense" && body.expense.amount != null && !(Number(body.expense.amount) >= 0)) return err(400, "bad_request", "The amount must be a number of dollars, 0 or more.");
        if (k === "event" && Date.parse(body.event.end ?? a.event.end) <= Date.parse(body.event.start ?? a.event.start)) return err(400, "bad_request", "The event must end after it starts.");
        if (k === "message" && body.message.to && !/^\+[1-9][0-9]{6,14}$/.test(body.message.to)) return err(400, "bad_request", "A text needs a phone number like +15555550123.");
        a[k] = { ...a[k], ...Object.fromEntries(Object.entries(body[k]).filter(([, v]) => v !== "" && v != null)) };
        if (k === "expense") a.title = a.expense.amount == null ? `Log ${a.expense.label}` : `Log $${a.expense.amount.toFixed(2)} for ${a.expense.label}`;
        else if (k !== "message" && body[k].title) a.title = body[k].title;
      }
      return ok(200, confirmAction(a, body?.deliver === "draft" ? "draft" : body?.deliver ?? "send"));
    }
    if ((mm = p.match(/^\/actions\/([^/]+)\/dismiss$/)) && m === "POST") {
      const a = db.actions.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!a) return err(404, "not_found", "No such action.");
      if (a.status !== "proposed" && a.status !== "failed") return err(409, "not_proposed", `Action is ${a.status}, so it can't be skipped.`);
      a.status = "dismissed"; emit("action.updated", a);
      return ok(200, { action: a, receipt: receipt("action", `Skipped “${a.title ?? a.type}”. Nothing was done.`, a.source_moment_ids, a.id) });
    }
    if ((mm = p.match(/^\/actions\/([^/]+)\/undo$/)) && m === "POST") {
      const a = db.actions.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!a) return err(404, "not_found", "No such action.");
      const orig = [...db.receipts].reverse().find((r) => r.action_id === a.id && r.undo.available);
      if (!orig || Date.parse(orig.undo.until) < Date.now()) return err(409, "undo_expired", "The undo window has closed.");
      orig.undo = { available: false, until: orig.undo.until };
      if (a.external?.provider === "cortex_list") { db.lists.expenses = db.lists.expenses.filter((x) => x.id !== a.external.id); emit("list.updated", listOut("expenses")); }
      a.status = "undone"; emit("action.updated", a);
      return ok(200, { action: a, receipt: receipt("action", `Undid: ${orig.summary}`, a.source_moment_ids, a.id) });
    }
    if (p === "/receipts" && m === "GET") return ok(200, { items: [...db.receipts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) });
    if ((mm = p.match(/^\/people\/([^/]+)$/)) && m === "PATCH") {
      const person = db.people.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!person) return err(404, "not_found", "No such person.");
      if ("phone" in (body ?? {})) {
        const phone = String(body.phone ?? "").replace(/\s/g, "");
        if (phone && !/^\+[1-9][0-9]{6,14}$/.test(phone)) return err(400, "bad_request", "A phone number looks like +15555550123 (a plus, the country code, then the number).");
        if (phone) person.phone = phone; else delete person.phone;
      }
      for (const k of ["company", "role", "notes", "topics"]) if (k in (body ?? {})) person[k] = body[k];
      emit("person.updated", person);
      return ok(200, person);
    }
    if (p === "/privacy" && m === "GET") return ok(200, db.privacy);
    if (p === "/privacy/pause" && m === "POST") {
      if (!["capturing", "paused", "off_record"].includes(body?.state)) return err(400, "bad_request", "state must be capturing, paused or off_record.");
      db.privacy = { state: body.state, since: now() }; emit("privacy.changed", db.privacy);
      return ok(200, db.privacy);
    }
    if (p === "/modes" && m === "GET") return ok(200, { items: db.modes, suggestion: db.suggestion });
    if (p === "/modes" && m === "POST") {
      const name = (body?.name ?? "").trim();
      if (!name) return err(400, "bad_request", "name is required.");
      const mid = body.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
      if (!SLUG.test(mid)) return err(400, "bad_request", "id must be a short lowercase slug, e.g. lab.");
      if (db.modes.some((x) => x.id === mid)) return err(409, "exists", `A mode called ${mid} already exists.`);
      const bad = (body.allowed_actions ?? []).filter((a) => !ACTION_TYPES.includes(a));
      if (bad.length) return err(400, "bad_request", `Unknown action type: ${bad.join(", ")}.`);
      const mode = { id: mid, name, description: body.description ?? "", captures: body.captures ?? [], speaks: body.speaks ?? "on request", proposes: body.proposes ?? [],
        allowed_actions: [...new Set(body.allowed_actions ?? [])], auto_suggest: body.auto_suggest ?? true, retention_days: body.retention_days ?? null, custom: true, active: false };
      db.modes.push(mode);
      return ok(201, mode);
    }
    if (p === "/modes/suggestion/dismiss" && m === "POST") {
      const s = db.suggestion;
      if (s) { db.dismissedAt[s.mode_id] = now(); db.suggestion = null; }
      return ok(200, { dismissed: !!s });
    }
    if ((mm = p.match(/^\/modes\/([^/]+)\/activate$/)) && m === "POST") {
      const mode = db.modes.find((x) => x.id === decodeURIComponent(mm[1]));
      return mode ? ok(200, activateMode(mode)) : err(404, "not_found", "No such mode.");
    }
    if ((mm = p.match(/^\/modes\/([^/]+)$/)) && (m === "PATCH" || m === "DELETE")) {
      const mode = db.modes.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!mode) return err(404, "not_found", "No such mode.");
      if (m === "DELETE") {
        if (!mode.custom) return err(409, "builtin", "Built-in modes cannot be deleted.");
        db.modes = db.modes.filter((x) => x !== mode);
        if (mode.active) activateMode(db.modes.find((x) => x.id === "focus"));
        return ok(200, { deleted: mode.id });
      }
      const bad = (body?.allowed_actions ?? []).filter((a) => !ACTION_TYPES.includes(a));
      if (bad.length) return err(400, "bad_request", `Unknown action type: ${bad.join(", ")}.`);
      if ("name" in (body ?? {}) && !String(body.name).trim()) return err(400, "bad_request", "name cannot be empty.");
      const notAuto = (body?.auto_run ?? []).filter((a) => !AUTO_ELIGIBLE.includes(a));
      if (notAuto.length) return err(400, "bad_request", `${notAuto.join(", ")} always needs your yes. Only ${AUTO_ELIGIBLE.join(", ")} can run on their own.`);
      for (const k of ["name", "description", "captures", "speaks", "proposes", "allowed_actions", "auto_suggest", "auto_run", "retention_days"]) if (k in (body ?? {})) mode[k] = body[k];
      emit("mode.changed", mode);
      return ok(200, mode);
    }

    if (p === "/recap" && m === "GET") return ok(200, recap(q("mode"), q("kind") === "lecture" ? "lecture" : "meeting"));
    if (p === "/look" && m === "POST") return look(body);
    if (p === "/actions/generate" && m === "POST") return generate(body);
    if (p === "/routines" && m === "GET") return ok(200, { items: db.routines.map(routineOut) });
    if (p === "/routines" && m === "POST") {
      const bad = !body?.title || !body?.time ? "title and time are required." : validRoutine(body);
      if (bad) return err(400, "bad_request", bad);
      const r = { id: id("rtn"), title: body.title.trim(), time: body.time, days: body.days ?? [], spoken: body.spoken ?? body.title.trim(), active: true, created_at: now() };
      db.routines.push(r);
      return ok(201, routineOut(r));
    }
    if ((mm = p.match(/^\/routines\/([^/]+)$/)) && (m === "PATCH" || m === "DELETE")) {
      const r = db.routines.find((x) => x.id === decodeURIComponent(mm[1]));
      if (!r) return err(404, "not_found", "No such routine.");
      if (m === "DELETE") { db.routines = db.routines.filter((x) => x !== r); return ok(200, { deleted: r.id }); }
      const bad = validRoutine(body ?? {});
      if (bad) return err(400, "bad_request", bad);
      for (const k of ["title", "time", "days", "spoken", "active"]) if (k in (body ?? {})) r[k] = body[k];
      return ok(200, routineOut(r));
    }
    if (p === "/caregiver" && m === "GET") return ok(200, caregiverOut());
    if (p === "/caregiver" && m === "PUT") {
      const c = db.caregiver;
      const email = "email" in (body ?? {}) ? body.email : c.email;
      if (body?.consent && !(email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return err(400, "bad_request", "A valid caregiver email is required to share.");
      if (body?.send_at && !TIME.test(body.send_at)) return err(400, "bad_request", "send_at must be HH:MM (24-hour).");
      Object.assign(c, { consent: !!body?.consent, email: email ?? null, name: "name" in (body ?? {}) ? body.name : c.name, send_at: body?.send_at ?? c.send_at,
        consented_at: body?.consent ? (c.consent ? c.consented_at : now()) : null });
      return ok(200, caregiverOut());
    }
    if (p === "/caregiver/send" && m === "POST") {
      const c = db.caregiver;
      if (!c.consent || !c.email) return err(409, "no_consent", "Caregiver sharing is off. Turn it on with a caregiver's email first.");
      const pv = caregiverPreview();
      if (!pv.source_moment_ids.length) return err(409, "nothing_today", "Nothing was captured today, so there is no summary to send.");
      const a = { id: id("act"), type: "caregiver_summary", status: "draft_saved", mode: "assist", person_id: null, title: `Today's summary for ${c.name ?? c.email}`,
        draft: { to: c.email, subject: pv.subject, body: pv.body }, source_moment_ids: pv.source_moment_ids };
      db.actions.push(a); c.last_sent_at = now();
      emit("action.updated", a);
      return ok(200, { action: a, receipt: receipt("action", `Saved today's summary for ${c.name ?? c.email} as a draft. (Dry run: sending is off.)`, a.source_moment_ids, a.id, true) });
    }

    if (p === "/lists" && m === "GET") return ok(200, { items: Object.keys(LIST_NAMES).map(listOut) });
    if ((mm = p.match(/^\/lists\/([^/]+)\/items$/)) && m === "POST") {
      const lid = decodeURIComponent(mm[1]);
      if (!LIST_NAMES[lid]) return err(404, "not_found", "No such list.");
      if (!String(body?.text ?? "").trim()) return err(400, "bad_request", "text is required.");
      const item = { id: id("itm"), list: lid, text: body.text.trim(), amount: body.amount ?? null, done: false, source_moment_id: body.source_moment_id ?? null, created_at: now() };
      db.lists[lid].push(item); emit("list.updated", listOut(lid));
      return ok(201, item);
    }
    if ((mm = p.match(/^\/lists\/([^/]+)\/items\/([^/]+)$/)) && (m === "PATCH" || m === "DELETE")) {
      const lid = decodeURIComponent(mm[1]);
      const item = db.lists[lid]?.find((x) => x.id === decodeURIComponent(mm[2]));
      if (!item) return err(404, "not_found", "No such list item.");
      if (m === "DELETE") db.lists[lid] = db.lists[lid].filter((x) => x !== item);
      else for (const k of ["text", "amount", "done"]) if (k in (body ?? {})) item[k] = body[k];
      emit("list.updated", listOut(lid));
      return ok(200, item);
    }
    if (p === "/digest" && m === "GET") return digest(q("date"));
    if (p === "/rewind" && m === "GET") return q("q") ? ok(200, rewind(q("q"))) : err(400, "bad_request", "q is required.");

    if (p === "/calls/started" && m === "POST") {
      if (typeof body?.call_id !== "string" || !body.call_id) return err(400, "bad_request", "call_id: required.");
      return ok(200, { ...callStart(body.call_id) });
    }
    if (p === "/calls/ended" && m === "POST") {
      if (typeof body?.call_id !== "string" || !body.call_id) return err(400, "bad_request", "call_id: required.");
      const c = callEnd(body.call_id);
      return c ? ok(200, { ...c }) : err(404, "not_found", "No such call.");
    }
    if (p === "/calls/current" && m === "GET") { const c = callCurrent(); return ok(200, { call: c ? { ...c } : null }); }

    if (p === "/_demo" && m === "GET") return ok(200, demoState());
    if (p === "/_demo/next" && m === "POST") { demoNext(); return ok(200, demoState()); }
    if (p === "/_demo/play" && m === "POST") { demoPlay(); return ok(200, demoState()); }
    if (p === "/_demo/reset" && m === "POST") { reset(); emit("demo.step", demoState()); return ok(200, demoState()); }
    return err(404, "not_found", `No route for ${m} ${p}.`);
  }

  reset();
  const ticker = setInterval(() => { tick(); skills.tick(); skills.briefTick(brief); }, 20_000);
  ticker.unref?.();
  return {
    handle,
    tick,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    stop() { clearInterval(ticker); if (playing) { clearInterval(playing); playing = null; } },
  };
}

function localDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
