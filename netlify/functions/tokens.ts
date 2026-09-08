import type { Config, Context } from "@netlify/functions";
import { toPublicToken } from "../../shared/account.ts";
import { createAgentToken, deleteToken, listTokens } from "../lib/accounts.ts";
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
    case "DELETE":
      return remove(req, context);
    default:
      return methodNotAllowed(["GET", "POST", "DELETE", "OPTIONS"]);
  }
}

async function list(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const tokens = await listTokens(auth.accountId);
  return json({ ok: true, tokens: tokens.map(toPublicToken) });
}

async function create(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  let name = "Agent token";
  if (req.headers.get("content-type")?.includes("json")) {
    const body = await readJson(req);
    if (!body.ok) return json({ ok: false, error: body.error }, 400);
    const record =
      body.value && typeof body.value === "object" && !Array.isArray(body.value)
        ? (body.value as Record<string, unknown>)
        : {};
    if (typeof record.name === "string" && record.name.trim()) {
      name = record.name.trim().slice(0, 80);
    }
  }
  const created = await createAgentToken(auth.accountId, name);
  return json(
    {
      ok: true,
      token: created.token,
      ...toPublicToken(created.record),
    },
    201,
  );
}

async function remove(req: Request, context: Context): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.mode === "solo") {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const value = context.params?.id;
  const id = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (!id) return json({ ok: false, error: "token id required" }, 400);
  const removed = await deleteToken(auth.accountId, id);
  return removed ? noContent() : json({ ok: false, error: "not_found" }, 404);
}

export const config: Config = {
  path: ["/api/tokens", "/api/tokens/:id"],
  method: ["GET", "POST", "DELETE", "OPTIONS"],
};
