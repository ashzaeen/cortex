"use client";
// Tap-to-talk for the Ask sheet, so the wearer can ask by voice through the glasses' Bluetooth mic and hear the
// answer through their speakers: the phone is the bridge. Web Speech API (iPhone Safari 14.5+, Chrome); where it
// is missing the Ask sheet keeps its text box (and the keyboard's own dictation).
import { useCallback, useEffect, useRef, useState } from "react";

// The DOM typings do not include the (prefixed) recognition API, so describe the little we use.
type RecognitionEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceSupported = () => ctor() !== null;

/**
 * Safari plays speech only when it was started during a tap. The answer arrives seconds after the tap, so speak a
 * silent utterance while handling the tap: that unlocks speech for the answer. Harmless where it is not needed.
 */
export function unlockSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* speech is a nicety: failing to unlock it must never stop listening or asking */ }
}

export type ListenState = "idle" | "listening" | "denied" | "error";

/** One spoken question: `onInterim` gets the words as they are heard, `onFinal` the finished question, once. */
export function useListen({ onInterim, onFinal }: { onInterim: (text: string) => void; onFinal: (text: string) => void }) {
  const [state, setState] = useState<ListenState>("idle");
  const current = useRef<{ rec: Recognition; cancelled: boolean } | null>(null);
  const handlers = useRef({ onInterim, onFinal });
  handlers.current = { onInterim, onFinal };

  const cancel = useCallback(() => {
    const c = current.current;
    if (!c) return;
    c.cancelled = true;
    current.current = null;
    try { c.rec.abort(); } catch { /* already stopped */ }
    setState((s) => (s === "listening" ? "idle" : s));
  }, []);

  const start = useCallback(() => {
    const Ctor = ctor();
    if (!Ctor) return;
    unlockSpeech();
    cancel();
    const rec = new Ctor();
    const me = { rec, cancelled: false };
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let heard = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const part = e.results[i];
        if (part.isFinal) heard += part[0].transcript; else interim += part[0].transcript;
      }
      if (!me.cancelled) handlers.current.onInterim((heard + interim).trim());
    };
    rec.onerror = (e) => {
      if (me.cancelled) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setState("denied");
      else if (e.error !== "no-speech" && e.error !== "aborted") setState("error");
    };
    rec.onend = () => {
      if (current.current === me) current.current = null;
      setState((s) => (s === "listening" ? "idle" : s));
      const text = heard.trim();
      if (text && !me.cancelled) { me.cancelled = true; handlers.current.onFinal(text); }
    };
    current.current = me;
    setState("listening");
    try { rec.start(); } catch { current.current = null; setState("error"); }
  }, [cancel]);

  // `stop` ends listening and still delivers what was heard; `cancel` throws it away.
  const stop = useCallback(() => { try { current.current?.rec.stop(); } catch { /* already stopped */ } }, []);
  useEffect(() => cancel, [cancel]);
  return { state, start, stop, cancel };
}
