// Server-only: the signed-in user's Google access token, read from the encrypted Auth.js session
// cookie and refreshed when it has expired. The API proxy forwards it to the backend as
// X-Google-Access-Token on action confirm and undo, so Calendar, Tasks and Drive writes run as the
// user. It never reaches the browser. Returns null when sign-in is off or the session has no Google
// grant (signed in before the Google scopes were added: sign out and in again).
import { getToken } from "next-auth/jwt";
import { authConfigured } from "@/auth";

type GoogleGrant = { accessToken?: string; refreshToken?: string; expiresAt?: number };

// Refreshed tokens are not written back to the cookie, so cache them per refresh token.
const refreshed = new Map<string, { token: string; exp: number }>();

export async function googleAccessToken(req: Request): Promise<string | null> {
  if (!authConfigured) return null;
  const secureCookie = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
  const jwt = await getToken({ req, secret: process.env.AUTH_SECRET!, secureCookie });
  const g = (jwt?.google ?? null) as GoogleGrant | null;
  if (!g?.accessToken) return null;
  const now = Date.now() / 1000;
  if (!g.expiresAt || g.expiresAt > now + 60) return g.accessToken;
  if (!g.refreshToken) return null;

  const hit = refreshed.get(g.refreshToken);
  if (hit && hit.exp > now + 60) return hit.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token", refresh_token: g.refreshToken,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const out = (await res.json()) as { access_token: string; expires_in: number };
  refreshed.set(g.refreshToken, { token: out.access_token, exp: now + out.expires_in });
  return out.access_token;
}
