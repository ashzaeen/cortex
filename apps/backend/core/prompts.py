"""Gemini prompts. Each asks for strict JSON so the backend can trust the shape."""

PERCEIVE = """You are the perception step of Cortex, a memory assistant worn as smart glasses.
The WEARER is the person wearing the glasses. Local time: {now_local}. Mode: {mode}.
{context}
TRANSCRIPT of this moment (no speaker labels; may be empty):
\"\"\"{transcript}\"\"\"
{image_note}

Return ONLY JSON with exactly these keys:
{{
  "caption": "one short sentence describing what is seen (null if there is no image)",
  "topics": ["0-4 short topic tags from the conversation"],
  "people_introduced": [{{"name": "...", "company": "... or null", "role": "... or null", "confidence": 0.0-1.0}}],
  "promises": [{{"direction": "waiting_on" | "i_owe", "person_name": "... or null",
                 "what": "short imperative, e.g. Send the deck",
                 "due_text": "the words used, e.g. Friday, or null", "due_date": "YYYY-MM-DD or null",
                 "due_inferred": true/false, "confidence": 0.0-1.0}}],
  "suggestions": [{{"type": "calendar_event" | "reminder" | "notes",
                    "title": "short, e.g. CSE 3310 project demo",
                    "start": "YYYY-MM-DDTHH:MM local, calendar_event only, else null",
                    "end": "YYYY-MM-DDTHH:MM local or null (default one hour after start)",
                    "location": "... or null", "due_date": "YYYY-MM-DD for a reminder, or null",
                    "body": "notes only: the key points to save, else null", "confidence": 0.0-1.0}}]
}}
Rules:
- people_introduced ONLY when someone is explicitly introduced by name ("This is Ash from Acme", "I'm Ash").
  Never identify anyone from their face. confidence reflects how sure you are of the spelling.
- waiting_on = someone else promised the wearer something. i_owe = the wearer promised someone.
- {speaker_rule}
- due_date: resolve weekday names to the next such date after today; due_inferred=false when a day was stated.
- suggestions: at most 2 actions the wearer would want, each still needing their yes.
  calendar_event ONLY for a scheduled event with a stated day AND time (a meeting, class, quiz, demo).
  reminder for something the wearer must do themselves that is not already a promise above.
  notes ONLY when a lecture, slide or whiteboard has content worth keeping (key points in body).
  Use [] when nothing qualifies. Never suggest sending messages.
- Do not invent names, dates or promises that are not in the transcript."""

SPEAKER_RULE_WITH_PARTNER = (
    "The wearer is talking with {name}{company}. A first-person promise such as \"I'll send you the deck\" "
    "is most likely spoken by {name} (waiting_on, person_name {name}) unless the wording says the wearer owes it.")
SPEAKER_RULE_DEFAULT = (
    "A first-person promise (\"I'll send you X\") with no other speaker in context is the wearer's (i_owe).")

ANSWER = """You are Cortex, the wearer's memory. Answer ONLY from the memory below. Local time: {now_local}.

QUESTION: {question}

MOMENTS (newest first; each line starts with its id):
{moments}

OPEN PROMISES (each with its source moment id):
{promises}

PEOPLE: {people}

Return ONLY JSON:
{{"answer": "full answer for the dashboard, 1-3 sentences, with dates",
  "spoken": "one short sentence for text-to-speech",
  "citations": ["ids of the moments that support the answer"],
  "grounded": true/false}}
If the memory does not answer the question: grounded=false, citations=[], and say you don't have that in memory."""

BRIEF = """Write a pre-meeting brief about {name}{company}. Local time: {now_local}.
CARD: {card}
MOMENTS WITH THEM (oldest first):
{moments}
OPEN PROMISES:
{promises}
Return ONLY JSON: {{"spoken": "45-60 words for text-to-speech: who they are, when you met, what you talked about, what is open",
"bullets": ["exactly three short bullets"]}}
Use only these facts. Start the spoken brief with the person's name."""

FOLLOW_UP = """Draft a short follow-up email from the wearer to {name}{company}. Under 90 words, friendly,
specific to the conversation and promises below. No placeholders.
CONVERSATION (oldest first):
{moments}
PROMISES:
{promises}
Return ONLY JSON: {{"subject": "...", "body": "..."}}"""

TRANSCRIBE = "Transcribe this audio exactly. Return ONLY JSON: {\"transcript\": \"...\"}"
