// Same-origin proxy (ADR 0005): the browser calls /api/*, this forwards to CORTEX_API_URL
// (the stateful mock locally, the real backend later). Streams responses, so /api/events (SSE) works.
import { googleAccessToken } from "@/lib/google-token";

export const dynamic = "force-dynamic";

// Approving or undoing an action may write to the user's Google account (Calendar, Tasks, Drive).
const GOOGLE_ACTION = /^actions\/[^/]+\/(confirm|undo)$/;

const API = (process.env.CORTEX_API_URL ?? "http://127.0.0.1:4010").replace(/\/$/, "");

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target = `${API}/${path.map(encodeURIComponent).join("/")}${search}`;
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") ?? "application/json",
    accept: req.headers.get("accept") ?? "*/*",
  };
  if (req.method === "POST" && GOOGLE_ACTION.test(path.join("/"))) {
    const google = await googleAccessToken(req).catch(() => null);
    if (google) headers["x-google-access-token"] = google;
  }
  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
      signal: req.signal,
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: { code: "api_unreachable", message: `Cannot reach the Cortex API at ${API}. Is the mock running (make dev)?` } },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE, proxy as PUT, proxy as PATCH };
