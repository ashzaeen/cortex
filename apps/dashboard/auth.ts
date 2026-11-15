// Google sign-in with Auth.js (next-auth v5). Direct Google OAuth: no third-party account, and the
// sign-in button is our own Brass button. Sessions are JWT cookies; nothing is stored server-side.
//
// Needs, in .env.local (local) or Vercel project env (deployed):
//   AUTH_SECRET          random string: `npx auth secret`
//   AUTH_GOOGLE_ID       OAuth client ID from Google Cloud Console
//   AUTH_GOOGLE_SECRET   its client secret
// Authorized redirect URIs on the Google client:
//   http://localhost:3000/api/auth/callback/google
//   https://<your domain>/api/auth/callback/google
// Without these, sign-in is off and /app stays open, so local development never locks anyone out.
//
// Sign-in also asks for Calendar events, Tasks and Drive (files Cortex creates only), so approved
// actions can land in the user's Google account (ACT-5 to ACT-7). The Google tokens stay inside the
// encrypted session cookie: the session callback never copies them out, so the browser never sees
// them. The API proxy reads them server-side (lib/google-token.ts) and forwards the access token.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const authConfigured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/drive.file",
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // offline + consent: Google returns a refresh token, so actions keep working after an hour.
      authorization: { params: { scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true" } },
    }),
  ],
  pages: { signIn: "/", error: "/" },
  trustHost: true,
  // A placeholder keeps the handlers loadable when sign-in is not configured; nothing can sign in then.
  secret: process.env.AUTH_SECRET ?? "auth-not-configured",
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === "google") {
        token.google = {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at, // seconds since epoch
          scope: account.scope,
        };
      }
      return token;
    },
  },
});
