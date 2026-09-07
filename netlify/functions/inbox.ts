import type { Config, Context } from "@netlify/functions";
import { requireOwnerAccess } from "../lib/auth.ts";
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
  const auth = requireOwnerAccess(req);
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

  if (id) {
    const item = await getInboxItem(id);
    if (!item) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    return json({ ok: true, item });
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  const items = await listInboxItems(Number.isFinite(limit) ? limit : 50);
  return json({ ok: true, items, count: items.length });
}

export const config: Config = {
  path: "/api/inbox",
  method: ["GET", "OPTIONS"],
};
