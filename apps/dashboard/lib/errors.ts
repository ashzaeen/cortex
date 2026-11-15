// Plain-language errors for toasts and sheets (design.md 11.16): say what happened and what is safe,
// never show a raw error string.
import { ApiError } from "./api";

export function friendly(e: unknown, fallback = "That didn't work. Nothing was changed."): string {
  if (e instanceof ApiError) {
    // 409s are written for people by the API (for example, capture is paused).
    if (e.status === 409 && e.message.length < 140) return e.message;
    if (e.status === 401 || e.status === 403) return "Sign in again to continue.";
    if (e.status >= 500) return "Cortex had a problem. Nothing was changed.";
    return fallback;
  }
  if (e instanceof TypeError || (e instanceof Error && /fetch|network|failed to/i.test(e.message))) {
    return "Couldn't reach Cortex. Nothing was changed.";
  }
  return fallback;
}
