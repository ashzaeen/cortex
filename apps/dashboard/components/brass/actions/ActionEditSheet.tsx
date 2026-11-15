"use client";
// Edit before approving (ACT-2, design.md 11.7 "Edit"). A suggestion is only a proposal: change what it
// will say or do here, then approve it from this sheet. One brass button; nothing runs until it is tapped.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Action, ActionEdits } from "@/lib/api";
import { Button, Label } from "../primitives";
import { Sheet } from "../Sheet";

const FIELD = "w-full rounded-md border border-edge bg-transparent px-4 py-3 text-base text-text placeholder:text-text-4";

/** An ISO time as the value a datetime-local input wants (the viewer's own clock, minutes). */
function toLocal(iso: string | undefined): string {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocal = (v: string) => new Date(v).toISOString();

type Deliver = "send" | "draft" | "do";
export const EDITABLE: Action["type"][] = ["follow_up_email", "calendar_event", "reminder", "flashcards", "notes", "message", "expense"];

type Props = {
  open: boolean;
  onClose: () => void;
  action: Action | null;
  /** The primary verb for this type, e.g. "Approve and Send". */
  verb: string;
  onApprove: (deliver: Deliver, edits: ActionEdits) => void;
};

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label as="label" htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function ActionEditSheet({ open, onClose, action, verb, onApprove }: Props) {
  const [v, setV] = useState<Record<string, string>>({});
  // Rendered on the page body: the card that opens this sheet is transformed and clipped, which breaks fixed positioning.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!open || !action) return;
    setV({
      to: action.draft?.to ?? action.message?.to ?? "",
      subject: action.draft?.subject ?? "",
      body: action.draft?.body ?? action.doc?.body ?? "",
      text: action.message?.text ?? "",
      title: action.event?.title ?? action.task?.title ?? action.doc?.title ?? action.title ?? "",
      start: toLocal(action.event?.start),
      end: toLocal(action.event?.end),
      location: action.event?.location ?? "",
      due: action.task?.due ?? "",
      notes: action.task?.notes ?? "",
      label: action.expense?.label ?? "",
      amount: action.expense?.amount == null ? "" : String(action.expense.amount),
    });
  }, [open, action]);

  if (!action || !host) return null;

  // Only what the person changed is sent, so untouched times keep their original zone.
  function edits(): ActionEdits {
    if (!action) return {};
    switch (action.type) {
      case "follow_up_email": return { draft: { to: v.to, subject: v.subject, body: v.body } };
      case "message": return { message: { to: v.to, text: v.text } };
      case "calendar_event": return { event: {
        title: v.title, location: v.location,
        ...(v.start && v.start !== toLocal(action.event?.start) ? { start: fromLocal(v.start) } : {}),
        ...(v.end && v.end !== toLocal(action.event?.end) ? { end: fromLocal(v.end) } : {}),
      } };
      case "expense": return { expense: { label: v.label, ...(v.amount?.trim() ? { amount: Number(v.amount) } : {}) } };
      case "reminder": return { task: { title: v.title, notes: v.notes, due: v.due } };
      case "flashcards": case "notes": return { doc: { title: v.title, body: v.body } };
      default: return {};
    }
  }
  const primary: Deliver = action.type === "follow_up_email" || action.type === "message" ? "send" : "do";
  const invalid = (action.type === "calendar_event" && (!v.title?.trim() || (v.start && v.end && new Date(v.end) <= new Date(v.start))))
    || (action.type === "message" && !/^\+[1-9][0-9]{6,14}$/.test(v.to ?? ""))
    || (action.type === "follow_up_email" && primary === "send" && !v.to?.trim())
    || (action.type === "expense" && (!v.label?.trim() || (v.amount?.trim() && !(Number(v.amount) >= 0))));
  const hint = action.type === "calendar_event" && v.start && v.end && new Date(v.end) <= new Date(v.start) ? "The event has to end after it starts."
    : action.type === "message" && !/^\+[1-9][0-9]{6,14}$/.test(v.to ?? "") ? "Use a full number such as +15555550123."
    : action.type === "expense" && v.amount?.trim() && !(Number(v.amount) >= 0) ? "Enter the amount as a number, like 12.50."
    : null;

  return createPortal(
    <Sheet open={open} onClose={onClose} label="Edit Suggestion" title="Edit Before You Approve" detent="full" matte>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!invalid) onApprove(primary, edits()); }}>
        {action.type === "follow_up_email" && (<>
          <Field id="ae-to" label="To"><input id="ae-to" data-autofocus type="email" value={v.to ?? ""} onChange={set("to")} className={FIELD} placeholder="name@company.com" autoComplete="off" /></Field>
          <Field id="ae-subject" label="Subject"><input id="ae-subject" value={v.subject ?? ""} onChange={set("subject")} className={FIELD} /></Field>
          <Field id="ae-body" label="Message"><textarea id="ae-body" rows={8} value={v.body ?? ""} onChange={set("body")} className={`${FIELD} resize-y`} /></Field>
        </>)}
        {action.type === "message" && (<>
          <Field id="ae-to" label="Text to"><input id="ae-to" data-autofocus inputMode="tel" value={v.to ?? ""} onChange={set("to")} className={FIELD} placeholder="+15555550123" autoComplete="off" /></Field>
          <Field id="ae-text" label="Message"><textarea id="ae-text" rows={4} maxLength={4000} value={v.text ?? ""} onChange={set("text")} className={`${FIELD} resize-y`} /></Field>
        </>)}
        {action.type === "expense" && (<>
          <Field id="ae-label" label="What for"><input id="ae-label" data-autofocus value={v.label ?? ""} onChange={set("label")} className={FIELD} maxLength={80} /></Field>
          <Field id="ae-amount" label="Amount in dollars"><input id="ae-amount" inputMode="decimal" value={v.amount ?? ""} onChange={set("amount")} className={FIELD} placeholder="12.50" /></Field>
        </>)}
        {action.type === "calendar_event" && (<>
          <Field id="ae-title" label="Event"><input id="ae-title" data-autofocus value={v.title ?? ""} onChange={set("title")} className={FIELD} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ae-start" label="Starts"><input id="ae-start" type="datetime-local" value={v.start ?? ""} onChange={set("start")} className={FIELD} /></Field>
            <Field id="ae-end" label="Ends"><input id="ae-end" type="datetime-local" value={v.end ?? ""} onChange={set("end")} className={FIELD} /></Field>
          </div>
          <Field id="ae-loc" label="Where"><input id="ae-loc" value={v.location ?? ""} onChange={set("location")} className={FIELD} placeholder="Optional" /></Field>
        </>)}
        {action.type === "reminder" && (<>
          <Field id="ae-title" label="Reminder"><input id="ae-title" data-autofocus value={v.title ?? ""} onChange={set("title")} className={FIELD} /></Field>
          <Field id="ae-due" label="Due"><input id="ae-due" type="date" value={v.due ?? ""} onChange={set("due")} className={FIELD} /></Field>
          <Field id="ae-notes" label="Notes"><textarea id="ae-notes" rows={3} value={v.notes ?? ""} onChange={set("notes")} className={`${FIELD} resize-y`} placeholder="Optional" /></Field>
        </>)}
        {(action.type === "flashcards" || action.type === "notes") && (<>
          <Field id="ae-title" label="Title"><input id="ae-title" data-autofocus value={v.title ?? ""} onChange={set("title")} className={FIELD} /></Field>
          <Field id="ae-body" label={action.type === "flashcards" ? "Cards (Q: and A: lines)" : "Notes"}><textarea id="ae-body" rows={10} value={v.body ?? ""} onChange={set("body")} className={`${FIELD} resize-y`} /></Field>
        </>)}

        {hint && <p className="text-[0.9375rem] text-danger" role="alert">{hint}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" type="submit" disabled={!!invalid} className="disabled:opacity-40">{verb}</Button>
          {action.type === "follow_up_email" && (
            <Button variant="secondary" onClick={() => onApprove("draft", edits())}>Save Draft</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
        <p className="t-footnote">Nothing happens until you approve. You can undo for a short while afterwards.</p>
      </form>
    </Sheet>,
    host,
  );
}
