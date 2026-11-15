// Public proxy for /demo: the demo talks to the REAL backend (every skill, mode and feature), with no sign-in.
//
// Safety, because anyone can reach this:
// - Each visitor is a private identity. The browser makes a random id; this turns it into a throwaway email
//   (v-<id>@demo.cortex) for X-Cortex-User, so the backend gives them their own copy of the demo profile
//   (core/user.py) and they never see anyone else's memory, nor can they touch the owner's.
// - The backend API key stays here, on the server.
// - No Google token is ever forwarded, so a demo visitor cannot create calendar events, tasks or Drive files
//   (and the hosted backend sends email as a dry run).
// - Requests are size-capped and rate limited per visitor, because every request can cost a model call.
export const dynamic = "force-dynamic";

const API = (process.env.CORTEX_API_URL ?? "http://127.0.0.1:4010").replace(/\/$/, "");
const API_KEY = process.env.CORTEX_API_KEY ?? "";
const VISITOR = /^[a-f0-9]{16,40}$/;
const MAX_BODY = 8_000_000; // a phone photo as base64
const WINDOW_MS = 60_000;
const LIMIT = 120; // requests per visitor per minute
const MODEL_LIMIT = 24; // the expensive ones (anything that posts)
const hits = new Map<string, { at: number; all: number; post: number }>();

function limited(id: string, method: string): boolean {
  const t = Date.now();
  let h = hits.get(id);
  if (!h || t - h.at > WINDOW_MS) { h = { at: t, all: 0, post: 0 }; hits.set(id, h); }
  h.all += 1;
  if (method !== "GET") h.post += 1;
  if (hits.size > 5000) for (const [k, v] of hits) if (t - v.at > WINDOW_MS) hits.delete(k);
  return h.all > LIMIT || h.post > MODEL_LIMIT;
}

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const url = new URL(req.url);
  const id = (req.headers.get("x-demo-visitor") ?? url.searchParams.get("visitor") ?? "").toLowerCase();
  if (!VISITOR.test(id)) {
    return Response.json({ error: { code: "bad_request", message: "Missing demo visitor id." } }, { status: 400 });
  }
  if (limited(id, req.method)) {
    return Response.json({ error: { code: "rate_limited", message: "That's a lot at once. Wait a moment and try again." } }, { status: 429 });
  }
  const hasBody = !["GET", "HEAD"].includes(req.method);
  if (hasBody && Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return Response.json({ error: { code: "too_large", message: "That file is too large for the demo." } }, { status: 413 });
  }
  const { path } = await ctx.params;
  url.searchParams.delete("visitor");
  const search = url.searchParams.toString();
  const target = `${API}/${path.map(encodeURIComponent).join("/")}${search ? `?${search}` : ""}`;
  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") ?? "application/json",
    accept: req.headers.get("accept") ?? "*/*",
    "x-cortex-user": `v-${id}@demo.cortex`,
  };
  if (API_KEY) headers["x-cortex-key"] = API_KEY;
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
      headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: { code: "api_unreachable", message: "The demo backend isn't reachable right now." } }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE, proxy as PUT, proxy as PATCH };
