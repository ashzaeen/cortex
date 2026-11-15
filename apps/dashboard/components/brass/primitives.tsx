// Brass primitives (design.md 11.12 buttons, 11.13 chips). Styling comes only from tokens.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const base = "press inline-flex items-center justify-center gap-2 rounded-pill whitespace-nowrap select-none";
const variants: Record<Variant, string> = {
  primary: "press-primary min-h-12 px-[26px] bg-brass text-ink font-bold text-[0.9375rem] hover:bg-brass-hi",
  secondary: "min-h-11 px-5 bg-fill-soft border border-edge text-text font-semibold text-[0.9375rem] hover:bg-fill-press active:bg-fill-press",
  ghost: "min-h-11 px-4 text-text font-semibold text-[0.9375rem] hover:bg-fill-soft active:bg-fill-soft",
  destructive: "min-h-11 px-5 bg-fill-soft border border-edge text-danger font-semibold text-[0.9375rem] hover:bg-fill-press active:bg-fill-press",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function IconButton({ label, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`press inline-flex size-11 flex-none items-center justify-center rounded-pill bg-fill-soft text-text hover:bg-fill-press active:bg-fill-press ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Chip({ selected = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`press inline-flex min-h-9 flex-none items-center whitespace-nowrap rounded-pill border px-4 text-[0.8125rem] font-medium ${
        selected ? "border-brass bg-brass-wash text-brass" : "border-transparent bg-fill-soft text-text-2 hover:bg-fill-press"
      } ${className}`}
      {...props}
    />
  );
}

export function Label({ children, className = "", as: Tag = "span", ...rest }: { children: ReactNode; className?: string; as?: "span" | "h2" | "h3" | "label"; htmlFor?: string; id?: string }) {
  return (
    <Tag className={`t-label ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Read-only mono tag (design.md 11.13). */
export function Tag({ children, tone = "brass" }: { children: ReactNode; tone?: "brass" | "muted" | "danger" | "ok" }) {
  const color = { brass: "text-brass", muted: "text-text-3", danger: "text-danger", ok: "text-ok" }[tone];
  return <span className={`t-data uppercase ${color}`}>{children}</span>;
}

/** A captured frame with the viewfinder brackets when selected (design.md 11.5, 16.2). */
export function Frame({ src, alt, selected = false, className = "", ratio = "7 / 5" }: { src: string | null; alt: string; selected?: boolean; className?: string; ratio?: string }) {
  return (
    <span className={`relative block flex-none overflow-hidden rounded-sm ${className}`} style={{ aspectRatio: ratio }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} decoding="async" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-full items-center justify-center" style={{ background: "linear-gradient(135deg, var(--amb-green), var(--amb-deep))" }}>
          <span className="tally-ring" data-state="paused" />
        </span>
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-sm" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)" }} />
      {selected && <span aria-hidden="true" className="vf" />}
    </span>
  );
}

/** Circular progress and check used by the approve morph (design.md 11.7). */
export function ProgressRing({ done = false, size = 28, tone = "brass" }: { done?: boolean; size?: number; tone?: "brass" | "ink" }) {
  const stroke = tone === "ink" ? "var(--ink)" : "var(--brass)";
  const wash = tone === "ink" ? "rgba(11, 23, 18, 0.25)" : "var(--brass-wash)";
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={done ? "" : "animate-spin"} style={{ animationDuration: "900ms" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={wash} strokeWidth="2.5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={done ? 0 : c * 0.7}
        style={{ transition: "stroke-dashoffset 300ms var(--ease-out)", transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
      {done && <path d={`M${size * 0.32} ${size * 0.52} l${size * 0.12} ${size * 0.12} l${size * 0.24} -${size * 0.26}`} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
