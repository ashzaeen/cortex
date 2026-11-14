import { snapshotSrc, type Moment, type Person } from "@/lib/api";
import { Card, time } from "./ui";

export function MomentCard({ m, people, action }: { m: Moment; people: Person[]; action?: React.ReactNode }) {
  const src = snapshotSrc(m.snapshot_url);
  const names = m.person_ids.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean);
  return (
    <Card className="flex gap-3">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={m.caption ?? "Snapshot"} className="h-16 w-20 shrink-0 rounded-lg object-cover" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{time(m.ts)}</span>
          <span className="rounded bg-line px-1.5">{m.source}</span>
          <span>{m.mode}</span>
          {names.length > 0 && <span>· {names.join(", ")}</span>}
        </div>
        {m.transcript && <p className="text-sm">&ldquo;{m.transcript}&rdquo;</p>}
        {m.caption && <p className="text-xs text-muted">{m.caption}</p>}
        {action}
      </div>
    </Card>
  );
}
