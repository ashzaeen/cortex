// Formatting and derived values from design.md: timecodes, short IDs, tags, due chips, light seeds.
import type { Moment, Person, Promise_ } from "./api";

const pad = (n: number) => String(n).padStart(2, "0");

/** Data timecode, 24-hour HH:MM:SS (design.md 15: "14:16:04"). */
export const timecode = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Human time, 12-hour (design.md 15: "2:16 PM"). */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

/** Short, stable IDs for display: m1, m2 ... in capture order across the loaded moments (design.md: "m2"). */
export function shortIds(moments: Moment[]): Map<string, string> {
  const sorted = [...moments].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return new Map(sorted.map((m, i) => [m.id, `m${i + 1}`]));
}

/** Receipt display ID: r_ plus four characters from the real ID (design.md: "r_0142"). */
export const receiptId = (id: string) => `r_${id.replace(/^rcp_/, "").replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase()}`;

export type Tag = "Network" | "Waiting On" | "Snapshot" | "Call" | "Focus" | "Student" | "Life" | "Assist";

/** The tag a moment shows on the timeline (design.md 11.5). */
export function tagFor(m: Moment, people: Person[], promises: Promise_[]): Tag {
  if (people.some((p) => p.introduced_moment_id === m.id)) return "Network";
  if (promises.some((p) => p.source_moment_id === m.id)) return "Waiting On";
  if (m.source === "call") return "Call";
  if ((m.snapshot_url || m.video_url) && !m.transcript) return "Snapshot";
  return (m.mode[0].toUpperCase() + m.mode.slice(1)) as Tag;
}

/** One-line title for a moment row: the transcript, or the caption. */
export const titleFor = (m: Moment) => (m.transcript ?? m.caption ?? (m.video_url ? "Video" : "Snapshot")).replace(/^["“]|["”]$/g, "");

/** Due chip (design.md 11.10): brass within 48 hours, danger when overdue. */
export function dueChip(p: Promise_): { text: string; tone: "brass" | "muted" | "danger" } {
  if (!p.due.date) return { text: p.due.text ? `DUE ${p.due.text.toUpperCase()}` : "NO DATE", tone: "muted" };
  const due = new Date(p.due.date + "T23:59:59");
  const hours = (due.getTime() - Date.now()) / 36e5;
  const day = due.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  if (hours < 0) return { text: `OVERDUE ${day}`, tone: "danger" };
  return { text: `DUE ${day}`, tone: hours <= 48 ? "brass" : "muted" };
}

/** Curly quotes and a true apostrophe for verbatim speech (design.md 5.4). */
export const curly = (s: string) => `“${s.replace(/^["“]|["”]$/g, "").replace(/'/g, "’")}”`;

/** A moment's light seed (design.md 7.3): stable values from its timestamp. */
export type LightSeed = { glintX: number; glintY: number; brass: number; deep: number };
export function lightSeed(iso: string | undefined): LightSeed {
  if (!iso) return { glintX: 0.5, glintY: 0.45, brass: 0.5, deep: 0.5 };
  let h = 2166136261;
  for (const c of iso) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const r = (shift: number) => ((h >>> shift) & 0xff) / 255;
  return { glintX: 0.3 + r(0) * 0.4, glintY: 0.3 + r(8) * 0.3, brass: r(16), deep: r(24) };
}

// Title Case for UI labels, buttons, headings and titles (design.md decision D19). Verbatim quotes are
// never passed through this. Keeps words with inner capitals (FaceTime, iOS, CSE) as they are.
const SMALL = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "with", "from", "into"]);
export function titleCase(s: string): string {
  const words = s.split(" ");
  return words.map((w, i) => w.split("-").map((part, j) => {
    if (!part || /[A-Z].*[A-Z]|^[a-z]+[A-Z]/.test(part) || /\d/.test(part)) return part; // FaceTime, iOS, CSE, 3310
    const lead = part.match(/^[^A-Za-z]*/)![0];
    const core = part.slice(lead.length);
    const bare = core.toLowerCase().replace(/[^a-z']/g, "");
    const edge = (i === 0 && j === 0) || i === words.length - 1;
    if (!edge && j === 0 && SMALL.has(bare)) return lead + core.toLowerCase();
    return lead + core.charAt(0).toUpperCase() + core.slice(1);
  }).join("-")).join(" ");
}
