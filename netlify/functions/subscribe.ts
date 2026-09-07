import type { Config, Context } from "@netlify/functions";
import { parseEndpointBody, parseSubscription } from "../../shared/subscription.ts";
import { requireOwnerAccess } from "../lib/auth.ts";
import { json, methodNotAllowed, noContent, optionsResponse, readJson } from "../lib/http.ts";
import { deleteSubscription, putSubscription } from "../lib/store.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return subscribe(req);
    case "DELETE":
      return unsubscribe(req);
    default:
      return methodNotAllowed(["POST", "DELETE", "OPTIONS"]);
  }
}

async function subscribe(req: Request): Promise<Response> {
  const auth = requireOwnerAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400);
  }

  const parsed = parseSubscription(body.value);
  if ("error" in parsed) {
    return json({ ok: false, error: parsed.error }, 400);
  }

  const key = await putSubscription({
    ...parsed,
    createdAt: new Date().toISOString(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return json({ ok: true, key }, 201);
}

async function unsubscribe(req: Request): Promise<Response> {
  const auth = requireOwnerAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400);
  }

  const record = body.value;
  const parsed =
    record && typeof record === "object" && "keys" in record
      ? parseSubscription(record)
      : parseEndpointBody(record);
  if (typeof parsed !== "string" && "error" in parsed) {
    return json({ ok: false, error: parsed.error }, 400);
  }
  const endpoint = typeof parsed === "string" ? parsed : parsed.endpoint;
  const removed = await deleteSubscription(endpoint);
  return removed ? noContent() : json({ ok: false, error: "not_found" }, 404);
}

export const config: Config = {
  path: "/api/subscribe",
  method: ["POST", "DELETE", "OPTIONS"],
};
