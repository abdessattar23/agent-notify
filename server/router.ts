import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@netlify/functions";
import health from "../netlify/functions/health.ts";
import notify from "../netlify/functions/notify.ts";
import ping from "../netlify/functions/ping.ts";
import subscribe from "../netlify/functions/subscribe.ts";
import vapidPublicKey from "../netlify/functions/vapid-public-key.ts";
import inbox from "../netlify/functions/inbox.ts";

type Handler = (req: Request, context: Context) => Promise<Response> | Response;

const routes = new Map<string, Handler>([
  ["/api/health", health],
  ["/api/vapid-public-key", vapidPublicKey],
  ["/api/subscribe", subscribe],
  ["/api/ping", ping],
  ["/api/inbox", inbox],
  ["/v1/notify", notify],
]);

export async function handleLocalApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  let handler = routes.get(url.pathname);
  let params: Record<string, string> = {};
  if (!handler) {
    const inboxMatch = /^\/api\/inbox\/([^/]+)$/.exec(url.pathname);
    if (inboxMatch) {
      handler = inbox;
      params = { id: decodeURIComponent(inboxMatch[1]) };
    }
  }
  if (!handler) return false;

  const request = await toRequest(req, url);
  const response = await handler(request, localContext(params));
  await writeResponse(res, response);
  return true;
}

async function toRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readIncoming(req));
  return new Request(url, { method, headers, body });
}

function readIncoming(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

function localContext(params: Record<string, string> = {}): Context {
  return {
    cookies: {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
    },
    geo: undefined,
    ip: "127.0.0.1",
    params,
    requestId: "local",
    server: { region: "local" },
    site: { id: "local", name: "agent-notify", url: "http://127.0.0.1:43177" },
    account: { id: "local" },
    deploy: { context: "dev", id: "local", published: true },
    next: async () => new Response("not implemented", { status: 500 }),
    waitUntil: () => undefined,
  } as unknown as Context;
}
