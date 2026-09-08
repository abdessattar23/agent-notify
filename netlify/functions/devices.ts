import type { Config, Context } from "@netlify/functions";
import { toPublicDevice } from "../../shared/account.ts";
import { parseSubscription } from "../../shared/subscription.ts";
import { parseTopicFilter } from "../../shared/topics.ts";
import {
  deleteDevice,
  deleteDeviceByEndpoint,
  getDevice,
  listDevices,
  putDevice,
  upsertDeviceFromSubscription,
} from "../lib/accounts.ts";
import { requireAccountAccess } from "../lib/auth.ts";
import { json, methodNotAllowed, noContent, optionsResponse, readJson } from "../lib/http.ts";

export default async function handler(req: Request, context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
      return list(req);
    case "POST":
      return create(req);
    case "PATCH":
      return patch(req, context);
    case "DELETE":
      return remove(req, context);
    default:
      return methodNotAllowed(["GET", "POST", "PATCH", "DELETE", "OPTIONS"]);
  }
}

async function list(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const devices = await listDevices(auth.accountId);
  return json({ ok: true, devices: devices.map(toPublicDevice) });
}

async function create(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const body = await readJson(req);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);
  const record = asRecord(body.value);
  const parsed = parseSubscription(record.subscription ?? record);
  if ("error" in parsed) return json({ ok: false, error: parsed.error }, 400);
  const topics = parseTopicFilter(record.topics);
  if (typeof topics === "object" && "error" in topics) {
    return json({ ok: false, error: topics.error }, 400);
  }
  const device = await upsertDeviceFromSubscription(auth.accountId, parsed, {
    userAgent: req.headers.get("user-agent") ?? undefined,
    topics,
  });
  return json({ ok: true, device: toPublicDevice(device) }, 201);
}

async function patch(req: Request, context: Context): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const id = paramId(context);
  if (!id) return json({ ok: false, error: "device id required" }, 400);
  const device = await getDevice(auth.accountId, id);
  if (!device) return json({ ok: false, error: "not_found" }, 404);
  const body = await readJson(req);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);
  const record = asRecord(body.value);
  if (!("topics" in record)) {
    return json({ ok: false, error: "topics is required" }, 400);
  }
  const topics = parseTopicFilter(record.topics);
  if (typeof topics === "object" && "error" in topics) {
    return json({ ok: false, error: topics.error }, 400);
  }
  device.topics = topics;
  await putDevice(auth.accountId, device);
  return json({ ok: true, device: toPublicDevice(device) });
}

async function remove(req: Request, context: Context): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const id = paramId(context);
  if (id) {
    const removed = await deleteDevice(auth.accountId, id);
    return removed ? noContent() : json({ ok: false, error: "not_found" }, 404);
  }
  const body = await readJson(req);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);
  const endpoint = asRecord(body.value).endpoint;
  if (typeof endpoint !== "string") {
    return json({ ok: false, error: "endpoint or device id required" }, 400);
  }
  const removed = await deleteDeviceByEndpoint(auth.accountId, endpoint);
  return removed ? noContent() : json({ ok: false, error: "not_found" }, 404);
}

function paramId(context: Context): string | undefined {
  const value = context.params?.id;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export const config: Config = {
  path: ["/api/devices", "/api/devices/:id"],
  method: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
};
