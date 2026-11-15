"use client";
// Text a contact (ACT-9) from their card: add or change the number, then "Text Ash" proposes a message that
// Cortex drafts from what is open with them. It lands on the suggestion card for approval; nothing is sent here.
import { useState } from "react";
import type { Person } from "@/lib/api";
import { givenName, prettyPhone, toE164 } from "@/lib/phone";
import { Button } from "../primitives";

type Props = {
  person: Person;
  /** Ask Cortex to draft a text to this person (it then waits for approval on the suggestion card). */
  onText: (p: Person) => void;
  /** Save the number (E.164), or null to remove it. */
  onPhone: (p: Person, phone: string | null) => Promise<void> | void;
};

const FIELD = "w-full rounded-md border border-edge bg-transparent px-4 py-3 text-base text-text placeholder:text-text-4";

export function PersonTextRow({ person, onText, onPhone }: Props) {
  const first = givenName(person.name);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    try { await onPhone(person, next); setEditing(false); setErr(null); }
    finally { setBusy(false); }
  }

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2 border-t border-divider pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const e164 = toE164(value);
          if (!e164) { setErr("Use a full number, like +1 555 555 0123."); return; }
          void save(e164);
        }}
      >
        <label className="t-label" htmlFor={`phone-${person.id}`}>{first}&rsquo;s Number</label>
        <input id={`phone-${person.id}`} data-autofocus type="tel" inputMode="tel" autoComplete="off" value={value}
          onChange={(e) => { setValue(e.target.value); setErr(null); }} placeholder="+1 555 555 0123" className={FIELD} />
        {err && <p role="alert" className="text-[0.9375rem] text-danger">{err}</p>}
        <p className="t-footnote">Only used to text {first} when you approve. Cortex can only text numbers verified on its Chert line.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" type="submit" disabled={busy}>Save Number</Button>
          <Button variant="ghost" onClick={() => { setEditing(false); setErr(null); }}>Cancel</Button>
          {person.phone && <Button variant="destructive" disabled={busy} onClick={() => void save(null)}>Remove Number</Button>}
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
      {person.phone ? (
        <>
          <Button variant="secondary" onClick={() => onText(person)}>Text {first}</Button>
          <span className="t-data text-text-3">{prettyPhone(person.phone)}</span>
          <Button variant="ghost" onClick={() => { setValue(person.phone ?? ""); setEditing(true); }}>Change</Button>
        </>
      ) : (
        <Button variant="ghost" onClick={() => { setValue(""); setEditing(true); }}>Add {first}&rsquo;s Number</Button>
      )}
    </div>
  );
}
