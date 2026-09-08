import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@netlify/functions";
import devices from "../netlify/functions/devices.ts";
import health from "../netlify/functions/health.ts";
import inbox from "../netlify/functions/inbox.ts";
import notify from "../netlify/functions/notify.ts";
import ping from "../netlify/functions/ping.ts";
import session from "../netlify/functions/session.ts";
import subscribe from "../netlify/functions/subscribe.ts";
import tokens from "../netlify/functions/tokens.ts";
import vapidPublicKey from "../netlify/functions/vapid-public-key.ts";

type Handler = (req: Request, context: Context) => Promise<Response> | Response;

type Route = {
  pattern: RegExp;
  keys: string[];
  handler: Handler;
};

function compile(path: string, handler: Handler): Route {
  const keys: string[] = [];
  const source = path.replace(/:([A-Za-z_]+)/g, (_, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${source}$`), keys, handler };
}

const routes: Route[] = [
  compile("/api/health", health),
  compile("/api/vapid-public-key", vapidPublicKey),
  compile("/api/subscribe", subscribe),
  compile("/api/ping", ping),
  compile("/api/inbox", inbox),
  compile("/api/inbox/:id", inbox),
  compile("/api/signup", session),
  compile("/api/login", session),
  compile("/api/logout", session),
  compile("/api/me", session),
  compile("/api/claim", session),
  compile("/api/devices", devices),
  compile("/api/devices/:id", devices),
  compile("/api/tokens", tokens),
  compile("/api/tokens/:id", tokens),
  compile("/v1/notify", notify),
  compile("/v1/t/:topic", notify),
];

export async function handleLocalApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  let match: { handler: Handler; params: Record<string, string> } | null = null;
  for (const route of routes) {
    const found = route.pattern.exec(url.pathname);
    if (!found) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(found[index + 1] ?? "");
    });
    match = { handler: route.handler, params };
    break;
  }
  if (!match) return false;

  const request = await toRequest(req, url);
  const response = await match.handler(request, localContext(match.params));
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
