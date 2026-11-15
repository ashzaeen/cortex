"use client";
// Landing page (design.md: Brass). Calm, premium, camera language. One brass action per view.
// 3D: the generic wayfarer glasses (lazy three.js, gated, flat fallback). Motion: ambient drift, a live
// reel of the Ash flow, and the modes section cycling the room's light. Reduced motion stills all of it.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Eye, Hand, Lock, MessageSquareQuote, ReceiptText, Trash2, UserCheck } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signInWithGoogle } from "@/app/actions";
import { Ambient } from "@/components/brass/Ambient";
import { MODE_LABEL, MODE_ORDER, SPRING_SNAPPY } from "@/components/brass/ModeDock";
import { Label } from "@/components/brass/primitives";
import type { Mode } from "@/lib/api";

const Glasses3D = dynamic(() => import("@/components/brass/Glasses3D"), { ssr: false, loading: () => <GlassesFlat /> });

type Props = { signedIn: boolean; userName: string | null; authReady: boolean; notice: string | null };

export default function Landing({ signedIn, userName, authReady, notice }: Props) {
  const [mode, setMode] = useState<Mode["id"]>("focus");
  return (
    <>
      <Ambient mode={mode} seed={{ glintX: 0.62, glintY: 0.36, brass: 0.55, deep: 0.5 }} paused={false} pullKey="" />
      <div className="relative z-[1]">
        <TopBar signedIn={signedIn} />
        <main className="mx-auto flex max-w-[1280px] flex-col gap-24 px-4 pb-24 md:gap-32 md:px-6 lg:px-10">
          <Hero signedIn={signedIn} userName={userName} authReady={authReady} notice={notice} />
          <HowItWorks />
          <Modes mode={mode} setMode={setMode} />
          <Trust />
          <Closing signedIn={signedIn} authReady={authReady} />
        </main>
        <Footer />
      </div>
    </>
  );
}

// ------------------------------------------------------------------ top bar
function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-10 px-4 md:px-6 lg:px-10" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}>
      <div className="glass glass--pill rise mx-auto flex min-h-14 max-w-[1280px] items-center gap-2 py-1.5 pl-5 pr-1.5">
        <Link href="/" className="flex min-h-11 items-center gap-3" aria-label="Cortex home">
          <span className="tally-ring" />
          <span className="text-lg font-bold tracking-[-0.01em]">Cortex</span>
        </Link>
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 md:flex">
          {[["How It Works", "#how"], ["Modes", "#modes"], ["Privacy", "#privacy"]].map(([l, h]) => (
            <a key={h} href={h} className="press flex min-h-11 items-center rounded-pill px-4 text-sm text-text hover:bg-fill-soft active:bg-fill-soft">{l}</a>
          ))}
        </nav>
        <Link href={signedIn ? "/app" : "/demo"} className="press ml-auto inline-flex min-h-11 items-center rounded-pill border border-edge bg-fill-soft px-5 text-[0.9375rem] font-semibold hover:bg-fill-press md:ml-2">
          {signedIn ? "Open Cortex" : "Try the Demo"}
        </Link>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ hero
function Hero({ signedIn, userName, authReady, notice }: Omit<Props, "notice"> & { notice: string | null }) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-12 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14" aria-labelledby="hero-title">
      <div className="rise flex flex-col gap-7" style={{ animationDelay: "200ms" }}>
        <span className="t-label">A second brain for Ray-Ban Meta</span>
        <h1 id="hero-title" className="font-voice font-medium tracking-[-0.02em]" style={{ fontSize: "clamp(2.75rem, 1.6rem + 4.2vw, 4.75rem)", lineHeight: 1.04 }}>
          Your Memory,<br /><span className="italic font-normal text-brass">With Proof.</span>
        </h1>
        <p className="max-w-[34rem] text-[1.0625rem] leading-relaxed text-text-2">
          Cortex remembers what your glasses hear and see. Ask about anything and get the exact moment as proof. When something needs doing, it drafts it and waits for your yes.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {signedIn ? (
            <Link href="/app" className="press press-primary inline-flex min-h-12 items-center gap-2 rounded-pill bg-brass px-[26px] text-[0.9375rem] font-bold text-ink hover:bg-brass-hi">
              Open Cortex <ArrowRight size={18} strokeWidth={1.75} />
            </Link>
          ) : (
            <GoogleButton authReady={authReady} />
          )}
          <Link href="/demo" className="press inline-flex min-h-12 items-center gap-2 rounded-pill border border-edge bg-fill-soft px-6 text-[0.9375rem] font-semibold">
            Try the Demo
          </Link>
        </div>
        <p className="t-data text-text-3">
          {signedIn ? `SIGNED IN${userName ? ` AS ${userName.toUpperCase()}` : ""}` : "THE DEMO NEEDS NO ACCOUNT - IT RUNS ON A SAMPLE WEEK"}
        </p>
        {notice && <p role="status" className="nested max-w-[34rem] px-4 py-3 text-[0.9375rem] text-brass">{notice}</p>}
      </div>

      <div className="rise relative" style={{ animationDelay: "380ms" }}>
        <GlassesStage />
        <div className="relative -mt-16 px-3 sm:px-8 lg:-mt-20 lg:px-10">
          <LiveReel />
        </div>
      </div>
    </section>
  );
}

function GoogleButton({ authReady }: { authReady: boolean }) {
  const [state, action, pending] = useActionState(async () => (await signInWithGoogle()) ?? null, null);
  return (
    <form action={action} className="contents">
      <button type="submit" className="press press-primary inline-flex min-h-12 items-center gap-2.5 rounded-pill bg-brass px-[26px] text-[0.9375rem] font-bold text-ink hover:bg-brass-hi" aria-describedby={state?.error ? "signin-error" : undefined}>
        <GoogleGlyph /> {pending ? "Opening Google" : "Continue with Google"}
      </button>
      {state?.error && <p id="signin-error" role="alert" className="basis-full text-[0.9375rem] text-brass">{state.error}</p>}
      {!authReady && !state && <span className="sr-only">Google sign-in is not set up on this deployment.</span>}
    </form>
  );
}

// Monochrome Google "G" in ink, so the only accent on the page stays brass (design.md 4.4).
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.72 14.55 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51Z" />
    </svg>
  );
}

// ------------------------------------------------------------------ 3D glasses
function can3D() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem < 4) return false;
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

function GlassesStage() {
  const [threeD, setThreeD] = useState<boolean | null>(null);
  useEffect(() => setThreeD(can3D()), []);
  return (
    <div className="nested relative h-[300px] overflow-hidden sm:h-[340px]" style={{ borderRadius: "var(--r-xl)" }}>
      <span aria-hidden="true" className="vf" style={{ inset: 16, ["--l" as string]: "22px", ["--w" as string]: "2px" }} />
      <span className="t-data absolute left-6 top-5 z-[1] text-brass">REC - 14:16:04</span>
      {threeD && <span className="t-data absolute right-6 top-5 z-[1] text-text-3">DRAG TO TURN</span>}
      {threeD === null ? null : threeD ? <Glasses3D live /> : <GlassesFlat />}
    </div>
  );
}

function GlassesFlat() {
  return (
    <div className="flex size-full items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 240 90" className="w-2/3">
        <path d="M10 22h96l-6 44a12 12 0 0 1-12 10H30a12 12 0 0 1-12-10Z M134 22h96l-8 44a12 12 0 0 1-12 10h-58a12 12 0 0 1-12-10Z" fill="var(--amb-deep)" stroke="var(--text-3)" strokeWidth="3" />
        <path d="M106 30q14-10 28 0" fill="none" stroke="var(--text-3)" strokeWidth="3" />
        <circle cx="14" cy="18" r="4" fill="var(--brass)" />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ live reel (the Ash flow, looping)
const BEATS = [
  { label: "REC / FOCUS", kind: "heard", text: "This is Ash from Acme.", meta: "m1 - 14:14:02 - GLASSES MIC", tag: "NETWORK" },
  { label: "WAITING ON", kind: "heard", text: "I’ll send you the deck Friday.", meta: "m2 - 14:16:04 - GLASSES MIC", tag: "DUE FRI" },
  { label: "ASK YOUR MEMORY", kind: "ask", text: "What did Ash promise me?", meta: "PROOF m2 - 14:16:04", tag: "VERBATIM" },
  { label: "SUGGESTED IN FOCUS", kind: "done", text: "Sent to Ash at Acme", meta: "RECEIPT r_0142 - 14:21:08 - FROM m2", tag: "UNDO" },
] as const;

function LiveReel() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(2);
  useEffect(() => {
    if (reduce) return;
    setI(0);
    const t = setInterval(() => setI((x) => (x + 1) % BEATS.length), 3200);
    return () => clearInterval(t);
  }, [reduce]);
  const b = BEATS[i];
  return (
    <div className="glass glass--float flex h-[164px] flex-col gap-3 overflow-hidden p-6" aria-label="Example: how Cortex remembers a promise" role="img">
      <div className="flex items-center justify-between">
        <span className="t-label">{b.label}</span>
        <span className="flex gap-1.5" aria-hidden="true">
          {BEATS.map((_, k) => <span key={k} className={`h-1 w-5 rounded-pill transition-colors duration-300 ${k === i ? "bg-brass" : "bg-divider"}`} />)}
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }} className="flex min-h-0 flex-1 flex-col justify-center gap-2">
          {b.kind === "ask" ? (
            <>
              <p className="t-headline truncate text-text-2">{b.text}</p>
              <p className="font-voice text-[1.375rem] italic leading-tight">“I’ll send you the deck Friday.”</p>
            </>
          ) : b.kind === "done" ? (
            <p className="t-headline flex items-center gap-2 text-brass"><ReceiptText size={18} strokeWidth={1.5} /> {b.text}</p>
          ) : (
            <p className="font-voice text-[1.375rem] italic leading-tight">“{b.text}”</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="t-data truncate text-brass">{b.meta}</span>
            <span className="t-data flex-none text-text-3">{b.tag}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ how it works
const STEPS = [
  { icon: Eye, title: "It Hears and Sees", body: "Your glasses capture moments on cue: who you met, what was promised, the whiteboard you looked at. Each one gets a timecode." },
  { icon: MessageSquareQuote, title: "It Answers With Proof", body: "Ask in plain words. The answer is the exact sentence that was said, with the moment it came from." },
  { icon: Hand, title: "It Acts When You Approve", body: "Cortex drafts the follow-up, the reminder or the flashcards. Nothing leaves until you say yes, and every action can be undone." },
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="flex scroll-mt-28 flex-col gap-10">
      <div className="flex max-w-[40rem] flex-col gap-3">
        <Label>How It Works</Label>
        <h2 id="how-title" className="t-title" style={{ fontSize: "clamp(1.75rem, 1.3rem + 1.6vw, 2.5rem)" }}>Remember, Prove, Follow Through</h2>
      </div>
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3 md:gap-6">
        {STEPS.map((s, k) => (
          <li key={s.title} className="nested lift flex flex-col gap-4 p-7" style={{ borderRadius: "var(--r-xl)" }}>
            <div className="flex items-center justify-between">
              <s.icon size={24} strokeWidth={1.5} className="text-brass" aria-hidden="true" />
              <span className="t-data text-text-3">0{k + 1}</span>
            </div>
            <h3 className="t-headline">{s.title}</h3>
            <p className="t-callout">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ modes (cycles the room's light)
const MODE_COPY: Record<Mode["id"], { listens: string; suggests: string; verb: string }> = {
  focus: { listens: "Meetings, intros, whiteboards and promises.", suggests: "Draft a Follow-Up to Ash", verb: "Approve and Send" },
  student: { listens: "Lectures, slides and deadlines.", suggests: "Turn the Lecture Slide into Flashcards", verb: "Add to My Deck" },
  life: { listens: "Errands, places and the things you set down.", suggests: "Remind Me When the Deck Is Due", verb: "Set Reminder" },
  assist: { listens: "Text and scenes, when you ask.", suggests: "Read the Whiteboard Aloud", verb: "Read Aloud" },
};

function Modes({ mode, setMode }: { mode: Mode["id"]; setMode: (m: Mode["id"]) => void }) {
  const reduce = useReducedMotion();
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduce) return;
    const t = setInterval(() => setMode(MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % 4]), 3800);
    return () => clearInterval(t);
  }, [auto, reduce, mode, setMode]);
  const c = MODE_COPY[mode];
  return (
    <section id="modes" aria-labelledby="modes-title" className="grid scroll-mt-28 grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div className="flex flex-col gap-3">
        <Label>Modes</Label>
        <h2 id="modes-title" className="t-title" style={{ fontSize: "clamp(1.75rem, 1.3rem + 1.6vw, 2.5rem)" }}>One Memory, Four Ways to Use It</h2>
        <p className="t-callout max-w-[32rem]">A mode changes what Cortex listens for and what it offers to do. The memory underneath is the same, so a promise made in Focus is still there in Life.</p>
      </div>
      <div className="glass flex flex-col gap-6 p-6 md:p-8">
        <div role="radiogroup" aria-label="Mode" className="grid w-full grid-cols-4 gap-1 rounded-pill bg-fill-soft p-1.5 sm:flex sm:w-auto sm:flex-wrap sm:gap-1.5 sm:self-start">
          {MODE_ORDER.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={m === mode} onClick={() => { setAuto(false); setMode(m); }}
              className={`press relative min-h-11 rounded-pill px-1 text-sm font-semibold min-[360px]:text-[0.9375rem] sm:px-5 ${m === mode ? "text-ink" : "text-text"}`}>
              {m === mode && <motion.span layoutId="landing-mode" transition={SPRING_SNAPPY} className="absolute inset-0 rounded-pill bg-brass" aria-hidden="true" />}
              <span className="relative">{MODE_LABEL[m]}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }} className="flex h-[148px] flex-col gap-3">
            <span className="t-label">Listens For</span>
            <p className="t-callout">{c.listens}</p>
            <span className="t-label mt-2">Suggests</span>
            <p className="t-headline flex items-center justify-between gap-3"><span className="truncate">{c.suggests}</span><span className="t-data flex-none text-brass">{c.verb.toUpperCase()}</span></p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ trust
const TRUST = [
  { icon: Lock, title: "Pause Is One Tap", body: "The ring shows when Cortex is capturing. Pause or go off the record at any time." },
  { icon: UserCheck, title: "No Face Recognition", body: "People enter your memory only when you introduce them or they agree." },
  { icon: Trash2, title: "Delete Anything", body: "Remove a moment and everything found in it, like a promise, goes with it." },
  { icon: ReceiptText, title: "Receipts for Every Action", body: "Every answer and action shows where it came from, with undo while it still can." },
];

function Trust() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="flex scroll-mt-28 flex-col gap-10">
      <div className="flex max-w-[40rem] flex-col gap-3">
        <Label>Privacy</Label>
        <h2 id="privacy-title" className="t-title" style={{ fontSize: "clamp(1.75rem, 1.3rem + 1.6vw, 2.5rem)" }}>You Stay in Control</h2>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {TRUST.map((t) => (
          <li key={t.title} className="flex flex-col gap-3 border-t border-edge pt-5">
            <t.icon size={22} strokeWidth={1.5} className="text-brass" aria-hidden="true" />
            <h3 className="t-headline">{t.title}</h3>
            <p className="t-callout">{t.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ closing + footer
function Closing({ signedIn, authReady }: { signedIn: boolean; authReady: boolean }) {
  return (
    <section aria-labelledby="close-title" className="glass flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
      <div className="flex flex-col gap-2">
        <h2 id="close-title" className="t-title" style={{ fontSize: "clamp(1.625rem, 1.3rem + 1.2vw, 2.25rem)" }}>See a Week of Memory in Action</h2>
        <p className="t-callout">The demo runs on a sample week in your browser. Nothing you do there is saved.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/demo" className="press inline-flex min-h-12 items-center gap-2 rounded-pill border border-edge bg-fill-soft px-6 text-[0.9375rem] font-semibold">
          Try the Demo <ArrowRight size={18} strokeWidth={1.75} />
        </Link>
        {signedIn && <Link href="/app" className="press inline-flex min-h-12 items-center rounded-pill px-5 text-[0.9375rem] font-semibold">Open Cortex</Link>}
        {!signedIn && authReady && <a href="#hero-title" className="press inline-flex min-h-12 items-center rounded-pill px-5 text-[0.9375rem] font-semibold">Sign In</a>}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-divider px-4 py-8 md:px-6 lg:px-10" style={{ paddingBottom: "calc(var(--safe-bottom) + 32px)" }}>
      <span className="flex items-center gap-3"><span className="tally-ring" data-state="paused" /><span className="font-semibold">Cortex</span></span>
      <span className="t-data text-text-3">BUILT AT HACKUTA 2026</span>
    </footer>
  );
}
