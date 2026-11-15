// Auth.js routes (/api/auth/*). More specific than app/api/[...path], so these never reach the API proxy.
//
// Auth.js builds its own URLs (the OAuth redirect_uri, post-sign-in redirects) from req.url. `npm run dev`
// binds to 0.0.0.0 so phones on the LAN can reach it, which makes req.url http://0.0.0.0:3000/... even
// when the browser asked for localhost. Sign-in starts from a server action (which uses the Host header,
// so Google gets localhost), but the callback then exchanged the code with a 0.0.0.0 redirect_uri and
// Google refused it. Rebuild the URL from the forwarded or Host header so both legs agree.
import { NextRequest } from "next/server";
import { handlers } from "@/auth";

async function withRequestHost(req: NextRequest): Promise<NextRequest> {
  if (process.env.AUTH_URL) return req; // an explicit AUTH_URL wins, as in Auth.js
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host");
  if (!host) return req;
  const orig = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? orig.protocol.slice(0, -1);
  const url = new URL(`${orig.pathname}${orig.search}`, `${proto}://${host}`);
  if (url.href === orig.href) return req;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  return new NextRequest(url, { method: req.method, headers: req.headers, body });
}

export const GET = async (req: NextRequest) => handlers.GET(await withRequestHost(req));
export const POST = async (req: NextRequest) => handlers.POST(await withRequestHost(req));
