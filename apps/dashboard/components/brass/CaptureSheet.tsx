"use client";
// Phone capture (#4), the D-1 fallback: iPhone camera plus what was said becomes a "phone" moment,
// the same payload the glasses app sends. Live camera needs HTTPS; plain http uses the photo picker.
import { Camera, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Moment, type PrivacyState } from "@/lib/api";
import { friendly } from "@/lib/errors";
import type { CapturePreset } from "@/lib/modeTools";
import { Button, Label } from "./primitives";
import { Sheet } from "./Sheet";

const MAX_SIDE = 640;
export function toJpegBase64(source: CanvasImageSource, w: number, h: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
}
export const fileToJpeg = (f: File) => new Promise<string>((ok, no) => {
  const url = URL.createObjectURL(f); const img = new Image();
  img.onload = () => { ok(toJpegBase64(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
  img.onerror = () => no(new Error("Couldn't read that photo."));
  img.src = url;
});

type WakeLock = { release: () => Promise<void> };

const DEFAULT_PRESET: CapturePreset = { title: "Capture with the Phone", placeholder: "This is Ash from Acme.", hint: "Tap the microphone on the keyboard to dictate." };

/** A preset (from a mode tool) changes the title, the hint, and what happens after saving. */
export function CaptureSheet({ open, onClose, privacy, onSaved, preset = DEFAULT_PRESET }: { open: boolean; onClose: () => void; privacy: PrivacyState["state"]; onSaved: (text: string, moment: Moment, preset: CapturePreset) => void; preset?: CapturePreset }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const wake = useRef<WakeLock | null>(null);
  const [live, setLive] = useState(false);
  const [canLive, setCanLive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const blocked = privacy !== "capturing";

  useEffect(() => { setCanLive(window.isSecureContext && !!navigator.mediaDevices?.getUserMedia); }, []);
  useEffect(() => { if (!open) stop(); else { setMsg(null); } }, [open]);

  async function start() {
    setMsg(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setLive(true); setPhoto(null);
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
      wake.current = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch { setMsg("Camera isn't available. Allow camera access, or take a photo."); }
  }
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    wake.current?.release().catch(() => {}); wake.current = null; setLive(false);
  }
  async function save() {
    if (blocked) return;
    setBusy(true); setMsg(null);
    try {
      let snap = photo;
      const v = video.current;
      if (!snap && live && v?.videoWidth) snap = toJpegBase64(v, v.videoWidth, v.videoHeight);
      const transcript = said.trim() || null;
      if (!snap && !transcript) { setMsg("Add a photo or say something first."); return; }
      const moment = await api.capture({ transcript, snapshot_base64: snap });
      onSaved(transcript ? "Moment Saved" : "Snapshot Saved", moment, preset);
      setSaid(""); setPhoto(null); stop(); onClose();
    } catch (e) { setMsg(friendly(e, "Couldn't save. Nothing was stored.")); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} label={preset.title} title={preset.title} detent="full">
      <div className="flex flex-col gap-5">
        {blocked && <p className="nested p-4 text-[0.9375rem] text-brass">Capture is {privacy === "paused" ? "paused" : "off the record"}. Nothing is being recorded.</p>}
        <div className="relative overflow-hidden rounded-lg bg-bg-deep" style={{ aspectRatio: "4 / 3" }}>
          <video ref={video} playsInline muted className={`size-full object-cover ${live ? "" : "hidden"}`} />
          {!live && photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/jpeg;base64,${photo}`} alt="Photo to save" className="size-full object-cover" />
          )}
          {!live && !photo && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-[0.9375rem] text-text-3">
              {canLive ? "Start the camera, or take a photo." : "Live camera needs HTTPS. Take a photo instead."}
            </p>
          )}
          {(live || photo) && <span aria-hidden="true" className="vf" style={{ inset: 12, ["--l" as string]: "18px" }} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {canLive && (live
            ? <Button variant="secondary" onClick={stop}>Stop Camera</Button>
            : <Button variant="secondary" onClick={start}><Camera size={18} strokeWidth={1.5} /> Start Camera</Button>)}
          <label className="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border border-edge bg-fill-soft px-5 text-[0.9375rem] font-semibold">
            <ImagePlus size={18} strokeWidth={1.5} /> Take Photo
            <input id="capture-photo" type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { stop(); setPhoto(await fileToJpeg(f)); } catch (err) { setMsg((err as Error).message); } }} />
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Label as="label" htmlFor="capture-said">What Was Said</Label>
          <textarea id="capture-said" value={said} onChange={(e) => setSaid(e.target.value)} rows={2} placeholder={preset.placeholder}
            className="w-full rounded-md border border-edge bg-transparent px-4 py-3 text-base text-text placeholder:text-text-4" />
          <p className="t-footnote">{preset.hint}</p>
        </div>
        {msg && <p role="alert" className="text-[0.9375rem] text-danger">{msg}</p>}
        <div><Button variant="primary" onClick={save} disabled={busy || blocked}>{busy ? "Saving" : "Save Moment"}</Button></div>
      </div>
    </Sheet>
  );
}
