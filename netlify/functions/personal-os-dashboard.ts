import type { Config, Context } from "@netlify/functions";
import { requireOwnerAccess } from "../lib/auth.ts";
import { getRuntimeEnv } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import {
  buildPersonalOsDashboard,
  personalOsSeedAllowedForRequest,
  personalOsStoreForRequest,
} from "../lib/personal-os.ts";

export default async function handler(req: Request, context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
      return dashboard(req, context);
    default:
      return methodNotAllowed(["GET", "OPTIONS"]);
  }
}

async function dashboard(req: Request, context: Context): Promise<Response> {
  const auth = requireOwnerAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const env = getRuntimeEnv();
  const payload = await buildPersonalOsDashboard({
    store: personalOsStoreForRequest(req, context.deploy?.published),
    now: new Date(),
    retentionDays: env.personalOsRetentionDays,
    seedAllowed: personalOsSeedAllowedForRequest(req),
    notifyEnabled: env.personalOsNotifyEnabled,
  });
  return json(payload);
}

export const config: Config = {
  path: "/api/personal-os/dashboard",
  method: ["GET", "OPTIONS"],
};
