import type { Config, Context } from "@netlify/functions";
import { normalizeTopicName } from "../../shared/topics.ts";
import { getAccountInboxItem, listAccountInboxItems } from "../lib/accounts.ts";
import { requireAccountAccess } from "../lib/auth.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { getInboxItem, listInboxItems } from "../lib/store.ts";

export default async function handler(req: Request, context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
      return getInbox(req, context);
    default:
      return methodNotAllowed(["GET", "OPTIONS"]);
  }
}

async function getInbox(req: Request, context: Context): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const url = new URL(req.url);
  const paramId =
    typeof context.params?.id === "string"
      ? context.params.id
      : Array.isArray(context.params?.id)
        ? context.params.id[0]
        : undefined;
  const queryId = url.searchParams.get("id") ?? undefined;
  const id = paramId || queryId || undefined;
  const topicRaw = url.searchParams.get("topic");
  const topic = topicRaw ? normalizeTopicName(topicRaw) : undefined;
  if (topic && typeof topic === "object") {
    return json({ ok: false, error: topic.error }, 400);
  }

  if (id) {
    const item =
      auth.mode === "multi" ? await getAccountInboxItem(auth.accountId, id) : await getInboxItem(id);
    if (!item) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    return json({ ok: true, item });
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  const cap = Number.isFinite(limit) ? limit : 50;
  const items =
    auth.mode === "multi"
      ? await listAccountInboxItems(auth.accountId, { limit: cap, topic })
      : await listInboxItems(cap);
  const filtered = topic && auth.mode === "solo" ? items.filter((item) => item.topic === topic) : items;
  return json({ ok: true, items: filtered, count: filtered.length });
}

export const config: Config = {
  path: ["/api/inbox", "/api/inbox/:id"],
  method: ["GET", "OPTIONS"],
};
