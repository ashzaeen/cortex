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
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const authConfigured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/", error: "/" },
  trustHost: true,
  // A placeholder keeps the handlers loadable when sign-in is not configured; nothing can sign in then.
  secret: process.env.AUTH_SECRET ?? "auth-not-configured",
});
