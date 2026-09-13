import type { Config, Context } from "@netlify/functions";
import { requireOwnerAccess } from "../lib/auth.ts";
import { getRuntimeEnv } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { buildPersonalOsDashboard, personalOsSeedAllowed } from "../lib/personal-os.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
      return dashboard(req);
    default:
      return methodNotAllowed(["GET", "OPTIONS"]);
  }
}

async function dashboard(req: Request): Promise<Response> {
  const auth = requireOwnerAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const env = getRuntimeEnv();
  const payload = await buildPersonalOsDashboard({
    now: new Date(),
    retentionDays: env.personalOsRetentionDays,
    seedAllowed: personalOsSeedAllowed({
      allowSeed: env.personalOsAllowSeed,
      context: env.deployContext,
      siteUrl: env.siteUrl,
    }),
    notifyEnabled: env.personalOsNotifyEnabled,
  });
  return json(payload);
}

export const config: Config = {
  path: "/api/personal-os/dashboard",
  method: ["GET", "OPTIONS"],
};
