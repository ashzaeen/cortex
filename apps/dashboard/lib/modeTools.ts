// The per-mode tools rail (design.md 11.2b, MODE-1, decided 2026-11-15). One data file: add, remove or
// reorder a tool here and the rail follows. A tap does one of four things (see ToolAction).
// Icons are named here and mapped to lucide components in components/brass/ModeTools.tsx.

export type SheetKey =
  | "ask" | "timeline" | "people" | "waiting" | "settings" | "receipts" | "call" | "capture" | "pairing"
  | "recap" | "decisions" | "lists" | "digest" | "rewind" | "routines" | "caregiver" | "look" | "limits" | "proposals" | "modesettings";

export type CapturePreset = {
  title: string;
  placeholder: string;
  hint: string;
  /** After saving, ask Cortex to draft this from the new moment (a suggestion to approve, nothing runs). */
  then?: "notes" | "flashcards";
};

export type ToolAction =
  | { kind: "sheet"; sheet: SheetKey; arg?: string }
  | { kind: "ask"; q: string }
  | { kind: "capture"; preset: CapturePreset }
  | { kind: "generate"; type: "flashcards" | "notes" | "read_aloud" };

export type Tool = { id: string; label: string; icon: string; hint: string; action: ToolAction };

const t = (id: string, label: string, icon: string, hint: string, action: ToolAction): Tool => ({ id, label, icon, hint, action });

const FOCUS: Tool[] = [
  t("recap", "Recap", "FileText", "Your last meeting in a few lines", { kind: "sheet", sheet: "recap", arg: "meeting" }),
  t("action-items", "Action Items", "ListChecks", "What came out of it to do", { kind: "sheet", sheet: "recap", arg: "actions" }),
  t("decisions", "Decisions", "Gavel", "Every decision you caught", { kind: "sheet", sheet: "decisions" }),
  t("whiteboard", "Whiteboard to Notes", "ScanText", "Photograph a board, get notes to approve", {
    kind: "capture", preset: { title: "Whiteboard to Notes", placeholder: "Optional: what is on the board", hint: "Take a photo of the board. Cortex drafts notes for you to approve.", then: "notes" } }),
  t("owe", "What I Owe", "HandCoins", "Promises you made", { kind: "ask", q: "What do I owe?" }),
  t("waiting", "Waiting On", "Hourglass", "Promises made to you", { kind: "sheet", sheet: "waiting" }),
  t("brief", "Brief", "Presentation", "A 20-second brief on someone", { kind: "sheet", sheet: "people" }),
  t("follow-up", "Follow-Up", "Send", "Draft a follow-up email", { kind: "sheet", sheet: "people" }),
  t("add-event", "Add Event", "CalendarPlus", "Say it once, approve the calendar entry", {
    kind: "capture", preset: { title: "Add Event", placeholder: "Demo with Ash on Friday at 3 pm", hint: "Say or type the event. Cortex proposes a calendar entry for you to approve." } }),
];

const STUDENT: Tool[] = [
  t("live-notes", "Live Notes", "BookOpen", "Notes from the lecture so far", { kind: "sheet", sheet: "recap", arg: "lecture" }),
  t("flashcards", "Flashcards", "Layers", "Cards from your latest moment", { kind: "generate", type: "flashcards" }),
  t("deadlines", "Deadlines", "CalendarClock", "Due dates Cortex caught", { kind: "sheet", sheet: "proposals", arg: "deadlines" }),
  t("study-blocks", "Study Blocks", "Timer", "Study time before each deadline", { kind: "sheet", sheet: "proposals", arg: "study" }),
  t("tutor", "Tutor Me", "GraduationCap", "Point the camera at a problem", { kind: "sheet", sheet: "look", arg: "tutor" }),
  t("snap-slide", "Snap Slide", "Camera", "Save a slide or board", {
    kind: "capture", preset: { title: "Snap Slide", placeholder: "Optional: what the slide is about", hint: "Take a photo of the slide or board." } }),
  t("lectures", "Lectures", "Clock", "Your recent moments", { kind: "sheet", sheet: "timeline" }),
  t("digest", "Digest", "Newspaper", "Your day in a few lines", { kind: "sheet", sheet: "digest" }),
];

const LIFE: Tool[] = [
  t("find-it", "Find It", "Search", "Where did I leave it?", { kind: "sheet", sheet: "look", arg: "find" }),
  t("shopping", "Shopping", "ShoppingBasket", "Your shopping list", { kind: "sheet", sheet: "lists", arg: "shopping" }),
  t("expenses", "Expenses", "Wallet", "What you spent", { kind: "sheet", sheet: "lists", arg: "expenses" }),
  t("log-receipt", "Log Receipt", "Receipt", "Photograph a receipt", {
    kind: "capture", preset: { title: "Log Receipt", placeholder: "Log this receipt, $12 for lunch", hint: "Photograph the receipt and say the amount." } }),
  t("reminders", "Reminders", "Bell", "Reminders Cortex suggested", { kind: "sheet", sheet: "proposals", arg: "reminders" }),
  t("message", "Message", "MessageSquare", "Texts waiting for approval", { kind: "sheet", sheet: "proposals", arg: "messages" }),
  t("people", "People", "Users", "Who you have met", { kind: "sheet", sheet: "people" }),
  t("rewind", "Rewind", "History", "Find the exact moment", { kind: "sheet", sheet: "rewind" }),
  t("digest", "Digest", "Newspaper", "Your day in a few lines", { kind: "sheet", sheet: "digest" }),
];

const ASSIST: Tool[] = [
  t("describe", "Describe", "Eye", "What is in front of me", { kind: "sheet", sheet: "look", arg: "describe" }),
  t("read-aloud", "Read Aloud", "Volume2", "Read the text in front of me", { kind: "sheet", sheet: "look", arg: "read" }),
  t("hazards", "Hazards", "TriangleAlert", "Anything to watch out for", { kind: "sheet", sheet: "look", arg: "hazards" }),
  t("find-object", "Find Object", "ScanSearch", "Where is it?", { kind: "sheet", sheet: "look", arg: "find" }),
  t("routine", "Routine", "Repeat", "Reminders at set times", { kind: "sheet", sheet: "routines" }),
  t("next-reminder", "Next Reminder", "Bell", "What is next today", { kind: "ask", q: "What's my next reminder?" }),
  t("caregiver", "Caregiver", "HeartHandshake", "Share a daily summary, only with your consent", { kind: "sheet", sheet: "caregiver" }),
  t("limits", "Limits", "Info", "What Cortex can and cannot do", { kind: "sheet", sheet: "limits" }),
];

// A custom mode (MODE-7) gets a small generic set.
const CUSTOM: Tool[] = [
  t("recap", "Recap", "FileText", "Your last session in a few lines", { kind: "sheet", sheet: "recap", arg: "meeting" }),
  t("digest", "Digest", "Newspaper", "Your day in a few lines", { kind: "sheet", sheet: "digest" }),
  t("rewind", "Rewind", "History", "Find the exact moment", { kind: "sheet", sheet: "rewind" }),
  t("people", "People", "Users", "Who you have met", { kind: "sheet", sheet: "people" }),
];

export const MODE_TOOLS: Record<string, Tool[]> = { focus: FOCUS, student: STUDENT, life: LIFE, assist: ASSIST };
export const toolsFor = (modeId: string): Tool[] => MODE_TOOLS[modeId] ?? CUSTOM;
