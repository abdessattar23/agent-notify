import type { Config, Context } from "@netlify/functions";
import { parseEndpointBody, parseSubscription } from "../../shared/subscription.ts";
import { parseTopicFilter } from "../../shared/topics.ts";
import { deleteDeviceByEndpoint, upsertDeviceFromSubscription } from "../lib/accounts.ts";
import { requireAccountAccess } from "../lib/auth.ts";
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
  const auth = await requireAccountAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400);
  }

  const record =
    body.value && typeof body.value === "object" && !Array.isArray(body.value)
      ? (body.value as Record<string, unknown>)
      : {};
  const parsed = parseSubscription(record.subscription ?? body.value);
  if ("error" in parsed) {
    return json({ ok: false, error: parsed.error }, 400);
  }

  if (auth.mode === "multi") {
    const topics = parseTopicFilter(record.topics);
    if (typeof topics === "object" && "error" in topics) {
      return json({ ok: false, error: topics.error }, 400);
    }
    const device = await upsertDeviceFromSubscription(auth.accountId, parsed, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      topics,
    });
    return json({ ok: true, key: device.id, id: device.id }, 201);
  }

  const key = await putSubscription({
    ...parsed,
    createdAt: new Date().toISOString(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return json({ ok: true, key }, 201);
}

async function unsubscribe(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
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
  const removed =
    auth.mode === "multi"
      ? await deleteDeviceByEndpoint(auth.accountId, endpoint)
      : await deleteSubscription(endpoint);
  return removed ? noContent() : json({ ok: false, error: "not_found" }, 404);
}

export const config: Config = {
  path: "/api/subscribe",
  method: ["POST", "DELETE", "OPTIONS"],
};
