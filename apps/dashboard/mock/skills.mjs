// The skills (SKL-1 to SKL-8) for the stateful mock: same paths, shapes and rules as apps/backend/skills, with the
// same offline stand-ins for the model. Plain JS, no Node APIs, so it also runs in the browser for /demo.
// Mock-only: POST /_demo/glasses {on} pretends the glasses are (not) streaming.
import { SKILLS } from "./skills-data.mjs";

const PHRASES = {
  spanish: { hello: "hola", "thank you": "gracias", "good morning": "buenos días", "where is the bathroom": "¿dónde está el baño?", "how much is this": "¿cuánto cuesta esto?", "i need help": "necesito ayuda" },
  french: { hello: "bonjour", "thank you": "merci", "good morning": "bonjour", "where is the bathroom": "où sont les toilettes ?", "how much is this": "combien ça coûte ?", "i need help": "j'ai besoin d'aide" },
  german: { hello: "hallo", "thank you": "danke", "good morning": "guten Morgen", "where is the bathroom": "wo ist die Toilette?", "how much is this": "wie viel kostet das?", "i need help": "ich brauche Hilfe" },
};
const OBJECTS = {
  spanish: { cup: "la taza", table: "la mesa", window: "la ventana", plant: "la planta", book: "el libro" },
  french: { cup: "la tasse", table: "la table", window: "la fenêtre", plant: "la plante", book: "le livre" },
  german: { cup: "die Tasse", table: "der Tisch", window: "das Fenster", plant: "die Pflanze", book: "das Buch" },
};
const NO_GLASSES = "You don't have your glasses on.";
const NO_VIEW = "I can't see anything right now. Point the camera at it first.";
const DAY = 86_400_000;

const plain = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(el|la|los|las|un|una|le|les|l'|der|die|das|ein|eine)\s+/, "").replace(/[^a-z0-9 ]+/g, "").trim();
const say = (spoken, text, extra = {}) => ({ spoken: String(spoken ?? "").slice(0, 300), text: text ?? spoken, ...extra });

/** @param {{ getDb: () => any, emit: (type: string, data: object) => void, id: (p: string) => string, now: () => string, ingest: (b: object) => any }} ctx */
export function createSkills({ getDb, emit, id, now, ingest }) {
  const S = () => (getDb().skills ??= {
    glassesOn: false, translate: { target_language: "spanish", source_language: "auto" }, immersion: { language: "spanish" },
    proactive: { enabled: false, dwell_seconds: 20, cooldown_minutes: 30 }, proactiveState: {}, offers: [], vocab: [], coach: [],
    nudges: { enabled: true, quiet_start: "22:00", quiet_end: "08:00", daily_cap: 3 }, nudgeLog: [], autobrief: { enabled: true }, briefLog: [], briefCalls: [],
  });
  const err = (status, code, message) => ({ status, body: { error: { code, message } } });
  const ok = (body, status = 200) => ({ status, body });
  const saveMoment = (transcript, caption, snapshot, tag) => {
    const out = ingest({ ts: now(), source: "dashboard", transcript, snapshot_base64: snapshot || null });
    if (out.error) return null;
    const m = out.moment; m.caption = caption; m.tags = [tag]; return m;
  };
  /** The view: a snapshot sent along, a moment, or the latest glasses frame. Returns {image, moment} or {error}. */
  function view(b, required = true) {
    if (b?.snapshot_base64) return { image: b.snapshot_base64 };
    if (b?.moment_id) {
      const m = getDb().moments.find((x) => x.id === b.moment_id);
      return m ? { image: m.snapshot_url ?? "frame", moment: m } : { error: err(404, "not_found", "No such moment.") };
    }
    if (b?.source === "glasses") {
      if (S().glassesOn) return { image: "glasses-frame" };
      if (required) return { error: err(409, "no_glasses", NO_GLASSES) };
    }
    return required ? { error: err(409, "no_view", NO_VIEW) } : { image: null };
  }
  const raw = (v) => String(v.image ?? "").toLowerCase();

  function world(b) {
    const v = view(b); if (v.error) return v.error;
    const q = (b.question ?? "").trim() || "What is this?"; const r = raw(v).concat(" ", q.toLowerCase());
    let spoken, text, confidence;
    if (q.toLowerCase().includes("price")) { spoken = text = "I can't check live prices, so I can't say if this is a good deal."; confidence = 0.6; }
    else if (r.includes("plant")) { spoken = "That looks like a leafy houseplant. Check the leaves before you water it."; text = "A leafy houseplant. I can't be sure of the species from here."; confidence = 0.7; }
    else if (S().glassesOn && v.image === "glasses-frame") { spoken = "That looks like a coffee mug on a desk."; text = "A ceramic coffee mug on a wooden desk, next to a laptop."; confidence = 0.8; }
    else { spoken = text = "I can see it, but I can't tell what it is with confidence."; confidence = 0.3; }
    const unsure = confidence < 0.5;
    if (unsure && !spoken.toLowerCase().includes("not sure")) spoken = "I'm not sure. " + spoken;
    let moment = null;
    if (b.save !== false) moment = saveMoment(q, text, v.image === "glasses-frame" ? null : b.snapshot_base64, "skill:world");
    return ok(say(spoken, text, { confidence, unsure, saved: !!moment, moment }));
  }

  function translate(b) {
    const cfg = S().translate;
    const target = (b.target_language || cfg.target_language).toLowerCase();
    const text = (b.text ?? "").trim();
    if (!text) return err(400, "bad_request", "Send text, or audio_base64 that has speech in it.");
    const t = text.toLowerCase().replace(/[^a-z' ]+/g, "").trim();
    let translation = PHRASES[target]?.[t] ?? "", source = "English";
    if (!translation && target === "english") {
      for (const [lang, table] of Object.entries(PHRASES)) for (const [en, foreign] of Object.entries(table)) {
        if (plain(foreign) === plain(text)) { translation = en[0].toUpperCase() + en.slice(1); source = lang[0].toUpperCase() + lang.slice(1); }
      }
    }
    const unsure = !translation;
    let moment = null;
    if (b.save && translation) moment = saveMoment(`${text} -> ${translation}`, `Translated to ${target}`, null, "skill:translate");
    return ok(say(unsure ? "I couldn't translate that." : translation, translation || "I couldn't translate that.", {
      original: text, translation, source_language: unsure ? "Unknown" : source, target_language: target, confidence: unsure ? 0 : 0.9, unsure, moment }));
  }

  const vocabOut = (d) => ({ ...d });
  function nameObjects(b) {
    const lang = (b.language || S().immersion.language).toLowerCase();
    const v = view(b); if (v.error) return v.error;
    const table = OBJECTS[lang]; const r = raw(v);
    if (!table) return ok(say("I can't see anything clear to name.", undefined, { items: [], language: lang, moment: null }));
    const found = Object.keys(table).filter((n) => r.includes(n));
    const names = (found.length ? found : ["cup", "table", "window"]).slice(0, 5);
    const moment = saveMoment(null, `Named in ${lang}: ${names.join(", ")}`, v.image === "glasses-frame" ? null : b.snapshot_base64, "skill:immersion");
    const items = names.map((n) => {
      let d = S().vocab.find((x) => x.language === lang && x.object === n);
      if (!d) { d = { id: id("vcb"), language: lang, object: n, word: table[n], box: 1, right: 0, wrong: 0, source_moment_id: moment?.id ?? null, created_at: now() }; S().vocab.push(d); }
      return vocabOut(d);
    });
    return ok(say("That's " + items.slice(0, 3).map((i) => `${i.word}, ${i.object}`).join(", ") + ".", undefined, { items, language: lang, moment }));
  }

  function quiz(language) {
    const pool = S().vocab.filter((x) => !language || x.language === language.toLowerCase()).sort((a, b) => a.box - b.box || a.created_at.localeCompare(b.created_at));
    if (!pool.length) return err(409, "no_vocab", "Name a few things first, then I can quiz you.");
    const d = pool[0]; const others = pool.slice(1).map((x) => x.word).filter((w) => w !== d.word).slice(0, 2);
    return ok({ vocab_id: d.id, language: d.language, object: d.object, box: d.box, prompt: `How do you say “${d.object}” in ${d.language[0].toUpperCase() + d.language.slice(1)}?`, choices: others.length ? [...new Set([d.word, ...others])].sort() : [] });
  }

  function observe(b) {
    const cfg = S().proactive, st = S().proactiveState;
    if (!cfg.enabled) return ok({ offered: false, reason: "disabled", dwell_seconds: 0, offer: null });
    const v = view(b); if (v.error) return v.error;
    const confusing = raw(v).includes("confusing");
    const t = Date.now();
    if (!confusing) { st.scene = null; st.since = null; return ok({ offered: false, reason: "nothing_confusing", dwell_seconds: 0, offer: null }); }
    if (st.scene !== "an error message" || !st.since) { st.scene = "an error message"; st.since = t; }
    const dwell = Math.floor((t - st.since) / 1000);
    if (dwell < cfg.dwell_seconds) return ok({ offered: false, reason: "watching", dwell_seconds: dwell, offer: null });
    const cool = cfg.cooldown_minutes * 60_000 * (st.dismissed ? 2 : 1);
    if (st.lastOffer && t - st.lastOffer < cool) return ok({ offered: false, reason: "cooldown", dwell_seconds: dwell, offer: null });
    const offer = { id: id("off"), scene: "an error message", text: "Want me to explain this error?", status: "offered", created_at: now() };
    S().offers.push(offer); Object.assign(st, { lastOffer: t, dismissed: false, scene: null, since: null });
    emit("skill.offer", offer);
    return ok({ offered: true, reason: "offered", dwell_seconds: dwell, offer });
  }

  const sessionOut = (d) => ({ id: d.id, goal: d.goal, steps: d.steps, step_index: d.index, current_step: d.status === "active" ? d.steps[d.index] ?? null : null, status: d.status, mistakes: d.mistakes, moment_id: d.moment_id ?? null, created_at: d.created_at });
  const coachReply = (d, spoken, mistake = null) => { const out = say(spoken, spoken, { session: sessionOut(d), mistake }); emit("coach.updated", { session: out.session, spoken: out.spoken, mistake }); return out; };
  function coachStart(b) {
    const goal = (b.goal ?? "").trim().replace(/[.]$/, "");
    if (goal.length < 4) return err(400, "bad_request", "I couldn't turn that into steps. Tell me what you want to do, like fixing a tap.");
    const steps = [`Get everything you need for: ${goal}`, "Clear a workspace and check nothing is plugged in or hot", `Do the main part of: ${goal}`, "Check the result against what you expected"];
    const d = { id: id("cch"), goal, steps, index: 0, status: "active", mistakes: 0, created_at: now() };
    S().coach.unshift(d);
    return ok(coachReply(d, `Step 1 of ${steps.length}. ${steps[0]}`), 201);
  }
  function coachStep(d, b) {
    if (d.status !== "active") return err(409, "session_over", "That coaching session is over. Start a new one.");
    const said = (b.said ?? "").toLowerCase(), n = d.steps.length;
    if (/\b(repeat|again)\b/.test(said)) return ok(coachReply(d, `Step ${d.index + 1} of ${n}. ${d.steps[d.index]}`));
    if (/\b(back|previous)\b/.test(said) && d.index > 0) { d.index -= 1; return ok(coachReply(d, `Back to step ${d.index + 1} of ${n}. ${d.steps[d.index]}`)); }
    if (/\b(wrong|oops|mistake|broke|spilled)\b/.test(said)) { d.mistakes += 1; return ok(coachReply(d, "Stop. Undo that and try the step again, slowly.", "That doesn't look right. Stop, undo that step and try again slowly.")); }
    if (/\b(done|next|finished|ok|okay)\b/.test(said)) {
      if (d.index + 1 >= n) {
        d.status = "done";
        const m = saveMoment(`Coached through: ${d.goal}`, `Finished ${n} steps, ${d.mistakes} correction(s).`, null, "skill:coach"); d.moment_id = m?.id ?? null;
        return ok(coachReply(d, "That was the last step. You're done."));
      }
      d.index += 1; return ok(coachReply(d, `Step ${d.index + 1} of ${n}. ${d.steps[d.index]}`));
    }
    return ok(coachReply(d, "Take your time. Say next when you're done with this step."));
  }

  // WAI-5: overdue nudges, driven by tick() and POST /skills/nudges/tick.
  const inQuiet = (h, cfg) => { const cur = h, s = cfg.quiet_start, e = cfg.quiet_end; return s === e ? false : s < e ? s <= cur && cur < e : cur >= s || cur < e; };
  function nudgesTick(ref = new Date()) {
    const cfg = S().nudges, db = getDb();
    const hhmm = ref.toTimeString().slice(0, 5);
    if (!cfg.enabled || inQuiet(hhmm, cfg)) return [];
    const today = ref.toISOString().slice(0, 10);
    const sent = S().nudgeLog.filter((n) => n.day === today);
    const done = new Set(sent.map((n) => n.promise_id));
    const due = db.promises.filter((p) => p.status === "confirmed" && p.due?.date && p.due.date < today && !done.has(p.id)).sort((a, b) => a.due.date.localeCompare(b.due.date));
    const fired = [];
    for (const p of due.slice(0, Math.max(cfg.daily_cap - sent.length, 0))) {
      const person = db.people.find((x) => x.id === p.person_id); if (!person) continue;
      const days = Math.round((Date.parse(today) - Date.parse(p.due.date)) / DAY);
      const late = days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
      const first = person.name.split(" ")[0], what = p.what[0].toLowerCase() + p.what.slice(1);
      const line = p.direction === "waiting_on" ? `${first} was meant to ${what}; that was due ${late}. Want me to draft a nudge?` : `You promised ${first} to ${what}; that was due ${late}.`;
      const n = { id: id("ndg"), promise_id: p.id, person_id: p.person_id, direction: p.direction, spoken: line, text: line, days_overdue: days, status: "open", source_moment_id: p.source_moment_id, created_at: now(), day: today };
      S().nudgeLog.push(n); emit("nudge.due", strip(n)); fired.push(strip(n));
    }
    return fired;
  }
  const strip = ({ day, ...n }) => n;

  // BRF-6: calendar actions that are done and start within 10 minutes, naming someone on file.
  function briefTick(briefFor) {
    if (!S().autobrief.enabled) return [];
    const db = getDb(), t = Date.now(), fired = [];
    for (const a of db.actions.filter((x) => x.type === "calendar_event" && ["done", "sent"].includes(x.status))) {
      const start = Date.parse(a.event?.start ?? ""); if (!(start >= t && start <= t + 600_000) || S().briefLog.includes(a.id)) continue;
      S().briefLog.push(a.id);
      const title = a.event.title ?? a.title ?? "";
      const person = db.people.find((p) => new RegExp(`\\b${p.name.split(" ")[0]}\\b`, "i").test(title)); if (!person) continue;
      const b = briefFor(person);
      const out = { person_id: person.id, event_title: title, event_start: new Date(start).toISOString(), spoken: b.spoken, bullets: b.bullets };
      emit("brief.due", out); fired.push(out);
    }
    return fired;
  }

  function searchPeople(query, limit) {
    const FILLER = new Set("who did i meet met that works work working on at from the a an in with people person anyone someone do know about me my is are find".split(" "));
    const ts = (query || "").toLowerCase().match(/[a-z0-9+#.]+/g)?.filter((w) => !FILLER.has(w) && w.length > 1) ?? [];
    if (!ts.length) return err(400, "bad_request", "Say what to look for, like a company or a topic.");
    const hits = getDb().people.map((p) => {
      const words = new Set([p.name, p.company, p.role, p.notes, ...(p.topics ?? [])].filter(Boolean).join(" ").toLowerCase().match(/[a-z0-9+#.]+/g) ?? []);
      return { person: p, matched: ts.filter((t) => words.has(t)) };
    }).filter((h) => h.matched.length).sort((a, b) => b.matched.length - a.matched.length).slice(0, limit);
    return ok({ items: hits });
  }

  /** Returns {status, body} for a skills route, or null when the path is not one of ours. */
  function handle(method, p, q, body, helpers) {
    const m = method.toUpperCase(); let mm;
    const settings = (key, allowed, check) => {
      if (m === "GET") return ok({ ...S()[key] });
      if (m === "PUT") {
        const bad = check?.(body ?? {}); if (bad) return err(400, "bad_request", bad);
        for (const k of allowed) if (body?.[k] != null) S()[key][k] = typeof body[k] === "string" && key !== "nudges" ? body[k].trim().toLowerCase() : body[k];
        return ok({ ...S()[key] });
      }
      return null;
    };
    if (p === "/_demo/skills-seed" && m === "POST") {  // mock-only: the demo profile's immersion words and coach history
      const t = now();
      S().vocab = (body?.vocab ?? []).map((v) => ({ ...v, created_at: t }));
      S().coach = (body?.coach_sessions ?? []).map(({ index, ...c }) => ({ ...c, index, created_at: t }));
      return ok({ vocab: S().vocab.length, coach: S().coach.length });
    }
    if (p === "/skills" && m === "GET") return ok({ items: SKILLS.map((s) => ({ ...s, enabled: s.id === "nudge" ? S().proactive.enabled : true })) });
    if (p === "/skills/view" && m === "GET") {
      const on = S().glassesOn;
      return ok({ available: on, moment_id: null, age_seconds: on ? 4 : null, message: on ? null : NO_GLASSES });
    }
    if (p === "/_demo/glasses" && m === "POST") { S().glassesOn = !!body?.on; return ok({ glasses: S().glassesOn }); }
    if (p === "/skills/people/search" && m === "GET") return searchPeople(q("q"), Number(q("limit") ?? 10));
    if (p === "/skills/world" && m === "POST") return world(body ?? {});
    if (p === "/skills/translate" && m === "POST") return translate(body ?? {});
    if (p === "/skills/translate/settings") return settings("translate", ["target_language", "source_language"], (b) => (["target_language", "source_language"].some((k) => k in b && !String(b[k] ?? "").trim()) ? "language cannot be empty." : null));
    if (p === "/skills/immersion/name" && m === "POST") return nameObjects(body ?? {});
    if (p === "/skills/immersion/vocab" && m === "GET") return ok({ items: S().vocab.filter((x) => !q("language") || x.language === q("language").toLowerCase()).map(vocabOut).reverse() });
    if ((mm = p.match(/^\/skills\/immersion\/vocab\/([^/]+)$/)) && m === "DELETE") {
      const i = S().vocab.findIndex((x) => x.id === mm[1]); if (i < 0) return err(404, "not_found", "No such word.");
      S().vocab.splice(i, 1); return ok({ deleted: true, id: mm[1] });
    }
    if (p === "/skills/immersion/quiz" && m === "GET") return quiz(q("language"));
    if (p === "/skills/immersion/quiz" && m === "POST") {
      const d = S().vocab.find((x) => x.id === body?.vocab_id); if (!d) return err(404, "not_found", "No such word.");
      const good = !!plain(body.answer) && plain(body.answer) === plain(d.word);
      d.box = good ? Math.min(d.box + 1, 5) : 1; d[good ? "right" : "wrong"] += 1;
      return ok(say(good ? "Correct." : `Not quite. It's ${d.word}.`, undefined, { correct: good, expected: d.word, box: d.box }));
    }
    if (p === "/skills/immersion/settings") return settings("immersion", ["language"], (b) => ("language" in b && !String(b.language ?? "").trim() ? "language cannot be empty." : null));
    if (p === "/skills/proactive/settings") return settings("proactive", ["enabled", "dwell_seconds", "cooldown_minutes"], (b) => (b.dwell_seconds != null && !(b.dwell_seconds >= 0 && b.dwell_seconds <= 600) ? "dwell_seconds must be 0 to 600." : b.cooldown_minutes != null && !(b.cooldown_minutes >= 0 && b.cooldown_minutes <= 1440) ? "cooldown_minutes must be 0 to 1440." : null));
    if (p === "/skills/proactive/observe" && m === "POST") return observe(body ?? {});
    if (p === "/skills/proactive/offers" && m === "GET") return ok({ items: S().offers.filter((o) => o.status === "offered").reverse() });
    if ((mm = p.match(/^\/skills\/proactive\/offers\/([^/]+)\/(accept|dismiss)$/)) && m === "POST") {
      const o = S().offers.find((x) => x.id === mm[1]); if (!o) return err(404, "not_found", "No such offer.");
      if (mm[2] === "dismiss") { o.status = "dismissed"; S().proactiveState.dismissed = true; return ok({ id: o.id, status: "dismissed" }); }
      const out = world({ ...(body ?? {}), question: `Explain what this is and what to do about it: ${o.scene}`, source: body?.snapshot_base64 ? undefined : body?.source });
      if (out.status === 200) o.status = "accepted";
      return out;
    }
    if (p === "/skills/coach" && m === "POST") return coachStart(body ?? {});
    if (p === "/skills/coach" && m === "GET") return ok({ items: S().coach.slice(0, 10).map(sessionOut) });
    if ((mm = p.match(/^\/skills\/coach\/([^/]+)(?:\/(step|end))?$/))) {
      const d = S().coach.find((x) => x.id === mm[1]); if (!d) return err(404, "not_found", "No such coach session.");
      if (!mm[2] && m === "GET") return ok(sessionOut(d));
      if (mm[2] === "step" && m === "POST") return coachStep(d, body ?? {});
      if (mm[2] === "end" && m === "POST") { if (d.status === "active") d.status = "ended"; return ok(sessionOut(d)); }
    }
    if (p === "/skills/nudges/settings") return settings("nudges", ["enabled", "quiet_start", "quiet_end", "daily_cap"], (b) => (["quiet_start", "quiet_end"].find((k) => b[k] != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k])) ? "quiet hours must be HH:MM (24-hour)." : b.daily_cap != null && !(b.daily_cap >= 0 && b.daily_cap <= 20) ? "daily_cap must be 0 to 20." : null));
    if (p === "/skills/nudges" && m === "GET") { const today = new Date().toISOString().slice(0, 10); return ok({ items: S().nudgeLog.filter((n) => n.day === today).reverse().map(strip) }); }
    if (p === "/skills/nudges/tick" && m === "POST") return ok({ items: nudgesTick() });
    if ((mm = p.match(/^\/skills\/nudges\/([^/]+)\/dismiss$/)) && m === "POST") {
      const n = S().nudgeLog.find((x) => x.id === mm[1]); if (!n) return err(404, "not_found", "No such nudge.");
      n.status = "dismissed"; return ok(strip(n));
    }
    if ((mm = p.match(/^\/promises\/([^/]+)\/(done|dismiss)$/)) && m === "POST") {
      const pr = getDb().promises.find((x) => x.id === mm[1]); if (!pr) return err(404, "not_found", "No such promise.");
      if (mm[2] === "done") { if (pr.status === "proposed") return err(409, "not_confirmed", "Confirm the promise first, or dismiss it."); pr.status = "done"; } else pr.status = "dismissed";
      return ok({ ...pr });
    }
    if (p === "/skills/brief/settings") return settings("autobrief", ["enabled"]);
    if (p === "/skills/brief/tick" && m === "POST") return ok({ items: briefTick(helpers.briefFor) });
    if (p === "/skills/brief/call" && m === "POST") {
      const person = getDb().people.find((x) => x.id === body?.person_id); if (!person) return err(404, "not_found", "No such person.");
      const c = { id: id("bcl"), person_id: person.id, status: "requested", spoken: helpers.briefFor(person).spoken, created_at: now() };
      S().briefCalls.push(c); emit("brief.call", c); return ok(c, 201);
    }
    if ((mm = p.match(/^\/skills\/brief\/call\/([^/]+)$/))) {
      const c = S().briefCalls.find((x) => x.id === mm[1]); if (!c) return err(404, "not_found", "No such brief call.");
      if (m === "GET") return ok(c);
      if (m === "PATCH") { if (!["dialing", "completed", "failed"].includes(body?.status)) return err(400, "bad_request", "status must be dialing, completed or failed."); c.status = body.status; return ok(c); }
    }
    return null;
  }

  return { handle, tick: nudgesTick, briefTick };
}
