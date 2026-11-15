// Words and one-line targets shared by the suggestion card and the Actions history sheet.
import type { Action } from "@/lib/api";

export const VERB: Record<Action["type"], string> = {
  follow_up_email: "Approve and Send",
  flashcards: "Add to My Deck",
  reminder: "Set Reminder",
  read_aloud: "Read Aloud",
  calendar_event: "Add to Calendar",
  notes: "Save to Drive",
  message: "Approve and Text",
  caregiver_summary: "Approve and Send",
  expense: "Log Expense",
};

export const STATUS_LABEL: Record<Action["status"], string> = {
  proposed: "Waiting", sent: "Sent", draft_saved: "Draft", done: "Done", undone: "Undone", dismissed: "Skipped", failed: "Failed",
};

/** One plain line: who or where it goes, so nothing leaves unseen. */
export function target(a: Action): string | null {
  if ((a.type === "follow_up_email" || a.type === "caregiver_summary") && a.draft) return `TO ${a.draft.to || "NO ADDRESS YET"}`;
  if (a.type === "message" && a.message) return `TEXT ${a.message.to}`;
  if (a.type === "calendar_event" && a.event) return `${new Date(a.event.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase()}${a.event.location ? ` · ${a.event.location.toUpperCase()}` : ""}`;
  if (a.type === "reminder" && a.task?.due) return `DUE ${a.task.due}`;
  if (a.type === "expense" && a.expense) return a.expense.amount == null ? "NO TOTAL READ - ADD ONE WITH EDIT" : `$${a.expense.amount.toFixed(2)} TO EXPENSES`;
  return null;
}

/** Types Cortex can still run: waiting, or failed and ready to retry. */
export const isOpen = (a: Action) => a.status === "proposed" || a.status === "failed";
