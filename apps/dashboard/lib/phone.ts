// A phone number as the API wants it (E.164, for example +15555550123), from what a person types.
// US-style numbers (10 digits, or 11 starting with 1) get +1; anything starting with + keeps its country code.
export function toE164(raw: string): string | null {
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  const out = t.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
  return out && /^\+[1-9][0-9]{6,14}$/.test(out) ? out : null;
}

/** +15555550123 as +1 555 555 0123, for reading. Other lengths are shown as they are. */
export function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

const HONORIFIC = /^(?:dr|prof|professor|mr|mrs|ms|mx|miss|sir|coach)\.?$/i;
/** The name to use in a button or sentence: "Prof. Morgan Lee" -> Morgan. */
export function givenName(name: string): string {
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && HONORIFIC.test(words[0])) words.shift();
  return words[0];
}
