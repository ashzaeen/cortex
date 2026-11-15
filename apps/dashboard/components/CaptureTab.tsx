"use client";
// Phone capture (#4): the fallback for T0-1. The iPhone camera plus what was said becomes a moment,
// posted to POST /moments with source "phone", the same payload the glasses app sends.
//
// Live camera needs a secure page (HTTPS or localhost). On plain http (a phone on the laptop's wifi)
// iOS blocks it, so the photo button opens the native camera through a file input instead.
import { useEffect, useRef, useState } from "react";
import { api, snapshotSrc, type Moment } from "@/lib/api";
import type { CortexData } from "@/lib/useCortex";
import { Button, Card, Section, time } from "./ui";

const MAX_SIDE = 640;
const JPEG_QUALITY = 0.7;

// Draw any image source scaled to MAX_SIDE and return base64 JPEG without the data: prefix.
function toJpegBase64(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
}

function fileToJpegBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(toJpegBase64(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error("Could not read that photo."));
    img.src = url;
  });
}

type WakeLock = { release: () => Promise<void> };

export function CaptureTab({ data }: { data: CortexData }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeRef = useRef<WakeLock | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [canLive, setCanLive] = useState(true);
  const [said, setSaid] = useState("");
  const [photo, setPhoto] = useState<string | null>(null); // base64 from the file picker
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Moment | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const privacy = data.privacy?.state ?? "capturing";
  const blocked = privacy !== "capturing";

  useEffect(() => {
    setCanLive(typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia);
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      // Keep the screen awake while capturing (iOS 16.4+); ignore if refused.
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
      wakeRef.current = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch {
      setMessage("Camera not available. Allow camera access, or use Take photo below.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    setCameraOn(false);
  }

  async function capture() {
    if (blocked) return;
    setBusy(true);
    setMessage(null);
    try {
      let snapshot = photo;
      const v = videoRef.current;
      if (!snapshot && cameraOn && v && v.videoWidth) snapshot = toJpegBase64(v, v.videoWidth, v.videoHeight);
      const transcript = said.trim() || null;
      if (!snapshot && !transcript) {
        setMessage("Add a photo or say something first.");
        return;
      }
      const m = await api.capture({ transcript, snapshot_base64: snapshot });
      setLast(m);
      setSaid("");
      setPhoto(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Capture failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {blocked && (
        <p className="rounded-lg border border-amber-500/40 p-3 text-sm text-amber-700 dark:text-amber-300">
          Capture is {privacy.replace("_", " ")}. Nothing will be stored. Resume it on the Privacy tab.
        </p>
      )}

      <Section title="Camera">
        <Card className="flex flex-col gap-2">
          <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "4 / 3" }}>
            <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${cameraOn ? "" : "hidden"}`} />
            {!cameraOn && photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/jpeg;base64,${photo}`} alt="Photo to capture" className="h-full w-full object-cover" />
            )}
            {!cameraOn && !photo && (
              <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/70">
                {canLive ? "Start the camera, or take a photo." : "Live camera needs HTTPS. Use Take photo."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canLive && (cameraOn
              ? <Button variant="ghost" onClick={stopCamera}>Stop camera</Button>
              : <Button variant="ghost" onClick={startCamera}>Start camera</Button>)}
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-line px-3 text-sm font-medium">
              Take photo
              <input
                id="photo"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try { stopCamera(); setPhoto(await fileToJpegBase64(f)); } catch (err) { setMessage((err as Error).message); }
                }}
              />
            </label>
            {photo && <Button variant="ghost" onClick={() => setPhoto(null)}>Clear photo</Button>}
          </div>
        </Card>
      </Section>

      <Section title="What was said">
        <textarea
          id="said"
          value={said}
          onChange={(e) => setSaid(e.target.value)}
          rows={2}
          placeholder="This is Ash from Acme."
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-base"
        />
        <p className="text-xs text-muted">Tip: tap the microphone on the iPhone keyboard to dictate.</p>
      </Section>

      <Button onClick={capture} disabled={busy || blocked} className="min-h-12 text-base">
        {busy ? "Saving…" : "Capture moment"}
      </Button>
      {message && <p className="text-sm text-red-600 dark:text-red-400">{message}</p>}

      {last && (
        <Section title="Saved">
          <Card className="flex gap-3">
            {snapshotSrc(last.snapshot_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshotSrc(last.snapshot_url)!} alt="Saved snapshot" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0 text-sm">
              <p className="text-xs text-muted">{time(last.ts)} · {last.source} · {last.id}</p>
              {last.transcript && <p>&ldquo;{last.transcript}&rdquo;</p>}
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}
