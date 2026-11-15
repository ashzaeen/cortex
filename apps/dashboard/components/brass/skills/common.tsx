"use client";
// Pieces every skill panel shares: the header with its "How it works" card (SKL-0), and the view source
// (glasses first, then the phone or laptop camera, then a photo). Asking for the glasses when they are off shows
// "You don't have your glasses on." and offers the device camera instead of guessing.
import { Camera, ChevronDown, Glasses, ImagePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { friendly } from "@/lib/errors";
import { skillsApi, type GlassesView, type SkillInfo, type View } from "@/lib/skills-api";
import { Button, Chip, Label, Tag } from "../primitives";

export function SkillHeader({ skill }: { skill: SkillInfo | undefined }) {
  const [open, setOpen] = useState(false);
  if (!skill) return null;
  const rows: [string, ReactNode][] = [
    ["Trigger", skill.trigger], ["Reads", skill.inputs], ["Steps", <ol key="s" className="flex list-decimal flex-col gap-1 pl-5">{skill.steps.map((s) => <li key={s}>{s}</li>)}</ol>],
    ["Output", skill.output], ["Asks first", skill.confirmation], ["Undo", skill.undo], ["Source", skill.source_moment], ["If unsure", skill.if_unsure],
  ];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-title">{skill.name}</h3>
        <Tag tone="muted">{skill.code}</Tag>
      </div>
      <p className="t-callout">{skill.tagline}</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="press flex min-h-11 items-center gap-2 self-start text-[0.8125rem] font-medium text-brass">
        How It Works <ChevronDown aria-hidden="true" size={16} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform var(--dur-base) var(--ease-out)" }} />
      </button>
      {open && (
        <dl className="nested rise flex flex-col gap-3 p-4">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1"><dt><Label>{k}</Label></dt><dd className="t-callout">{v}</dd></div>
          ))}
        </dl>
      )}
    </header>
  );
}

const MAX_SIDE = 640;
const jpeg = (src: CanvasImageSource, w: number, h: number) => {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
};
const fileToJpeg = (f: File) => new Promise<string>((ok, no) => {
  const url = URL.createObjectURL(f); const img = new Image();
  img.onload = () => { ok(jpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
  img.onerror = () => no(new Error("Couldn't read that photo."));
  img.src = url;
});

type Source = "glasses" | "camera" | "photo";

/** `picker` is the UI to render; `getView()` resolves to what the skill should look at, or null when there is none yet. */
export function useViewSource(defaultSource: Source = "glasses") {
  const [source, setSource] = useState<Source>(defaultSource);
  const [glasses, setGlasses] = useState<GlassesView | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setLive(false); }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (source !== "glasses") return;
    let off = false;
    const poll = () => skillsApi.glasses().then((g) => { if (!off) setGlasses(g); }).catch(() => { if (!off) setGlasses({ available: false, moment_id: null, age_seconds: null, message: "You don't have your glasses on." }); });
    poll(); const t = setInterval(poll, 5000);
    return () => { off = true; clearInterval(t); };
  }, [source]);
  useEffect(() => { if (source !== "camera") stop(); }, [source, stop]);

  async function startCamera() {
    setNote(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setLive(true);
    } catch { setNote("Camera isn't available. Allow camera access, or choose Photo."); }
  }
  const canLive = typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  const getView = useCallback(async (): Promise<View | null> => {
    if (source === "glasses") return glasses?.available ? { source: "glasses" } : null;
    if (source === "photo") return photo ? { snapshot_base64: photo } : null;
    const v = video.current;
    return live && v?.videoWidth ? { snapshot_base64: jpeg(v, v.videoWidth, v.videoHeight) } : null;
  }, [source, glasses, photo, live]);

  const glassesOff = source === "glasses" && glasses && !glasses.available;
  const ready = source === "glasses" ? !!glasses?.available : source === "photo" ? !!photo : live;

  const picker = (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Where Cortex looks" className="flex flex-wrap gap-2">
        <Chip selected={source === "glasses"} onClick={() => setSource("glasses")}><Glasses aria-hidden="true" size={16} className="mr-2" />Glasses</Chip>
        <Chip selected={source === "camera"} onClick={() => setSource("camera")}><Camera aria-hidden="true" size={16} className="mr-2" />Camera</Chip>
        <Chip selected={source === "photo"} onClick={() => setSource("photo")}><ImagePlus aria-hidden="true" size={16} className="mr-2" />Photo</Chip>
      </div>
      {source === "glasses" && glasses?.available && (
        <p className="nested t-callout flex items-center gap-3 p-4"><span className="tally-ring" data-state="live" aria-hidden="true" />Looking through your glasses. Last frame {glasses.age_seconds ?? 0}s ago.</p>
      )}
      {glassesOff && (
        <div role="status" className="nested rise flex flex-col gap-3 p-4">
          <p className="font-semibold">You don&rsquo;t have your glasses on.</p>
          <p className="t-callout">Put them on and this fills in by itself, or use this device&rsquo;s camera instead.</p>
          <Button variant="secondary" className="self-start" onClick={() => setSource("camera")}>Use the Camera Instead</Button>
        </div>
      )}
      {source === "camera" && (
        <div className="flex flex-col gap-3">
          <div className="nested relative overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
            <video ref={video} playsInline muted className="size-full object-cover" style={{ display: live ? "block" : "none" }} />
            {!live && <div className="flex size-full items-center justify-center p-6 text-center"><p className="t-callout">{canLive ? "The camera is off." : "Live camera needs a secure connection. Choose Photo."}</p></div>}
          </div>
          {!live && canLive && <Button variant="secondary" className="self-start" onClick={startCamera}>Turn On the Camera</Button>}
          {live && <Button variant="ghost" className="self-start" onClick={stop}>Turn Off the Camera</Button>}
        </div>
      )}
      {source === "photo" && (
        <div className="flex flex-col gap-3">
          {photo && /* eslint-disable-next-line @next/next/no-img-element */ <img alt="The photo you chose" src={`data:image/jpeg;base64,${photo}`} className="nested max-h-56 w-full object-cover" />}
          <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Choose a photo"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await fileToJpeg(f)); setNote(null); } catch (x) { setNote(friendly(x)); } } e.target.value = ""; }} />
          <Button variant="secondary" className="self-start" onClick={() => file.current?.click()}>{photo ? "Choose Another Photo" : "Choose a Photo"}</Button>
        </div>
      )}
      {note && <p role="alert" className="t-callout text-danger">{note}</p>}
    </div>
  );
  return { picker, getView, ready, source, setSource };
}

export function Said({ spoken, text, unsure, children }: { spoken: string; text?: string; unsure?: boolean; children?: ReactNode }) {
  return (
    <section className="nested rise flex flex-col gap-3 p-5" aria-live="polite">
      <Label>{unsure ? "Not Sure" : "Cortex Says"}</Label>
      <p className="t-display" style={{ fontSize: "1.5rem", lineHeight: 1.25 }}>{spoken}</p>
      {text && text !== spoken && <p className="t-callout">{text}</p>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-2"><Label>{label}</Label>{children}</label>;
}
export const inputCls = "min-h-12 w-full rounded-lg border border-edge bg-fill-soft px-4 text-[1rem] text-text placeholder:text-text-3";
