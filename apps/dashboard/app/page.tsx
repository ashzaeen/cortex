// Landing page (/). Server component: reads the session so signed-in visitors see "Open Cortex".
import { auth, authConfigured } from "@/auth";
import Landing from "@/components/landing/Landing";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = authConfigured ? await auth() : null;
  const notice =
    sp.signin === "required" ? "Sign in to open Cortex, or try the demo." :
    sp.error ? "Couldn't sign you in with Google. Try again." : null;
  return <Landing signedIn={!!session} userName={session?.user?.name ?? null} authReady={authConfigured} notice={notice} />;
}
