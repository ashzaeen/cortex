// The signed-in app. When Google sign-in is configured, /app requires a session; otherwise it stays
// open so local development and the mock keep working (see auth.ts).
import { redirect } from "next/navigation";
import { auth, authConfigured, isAllowed } from "@/auth";
import HomeApp from "@/components/HomeApp";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const session = authConfigured ? await auth() : null;
  if (authConfigured && !session) redirect("/?signin=required");
  if (authConfigured && !isAllowed(session?.user?.email)) redirect("/?error=AccessDenied");
  const user = session?.user ? { name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null } : null;
  return <HomeApp user={user} />;
}
