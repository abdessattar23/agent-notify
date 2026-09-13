import type { Config, Context } from "@netlify/functions";
import { requireOwnerAccess } from "../lib/auth.ts";
import { getRuntimeEnv } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { personalOsSeedAllowed, seedSyntheticPersonalOsEvents } from "../lib/personal-os.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return seed(req);
    default:
      return methodNotAllowed(["POST", "OPTIONS"]);
  }
}

async function seed(_req: Request): Promise<Response> {
  const auth = requireOwnerAccess(_req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const env = getRuntimeEnv();
  if (
    !personalOsSeedAllowed({
      allowSeed: env.personalOsAllowSeed,
      context: env.deployContext,
      siteUrl: env.siteUrl,
    })
  ) {
    return json({ ok: false, error: "seed_disabled" }, 403);
  }

  const stored = await seedSyntheticPersonalOsEvents({
    now: new Date(),
    retentionDays: env.personalOsRetentionDays,
  });
  return json({
    ok: true,
    stored,
    warning: "DEV-ONLY synthetic sample data. Never use production secrets with this endpoint.",
  });
}

export const config: Config = {
  path: "/api/personal-os/seed",
  method: ["POST", "OPTIONS"],
};
