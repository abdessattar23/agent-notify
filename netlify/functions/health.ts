import type { Config, Context } from "@netlify/functions";
import { getRuntimeEnv, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { isLegacyClaimAvailable } from "../lib/claim.ts";
import { resolveAppMode } from "../lib/mode.ts";
import { listSubscriptions } from "../lib/store.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
      return health();
    default:
      return methodNotAllowed(["GET", "OPTIONS"]);
  }
}

async function health(): Promise<Response> {
  const env = getRuntimeEnv();
  let subscriptionCount = 0;
  try {
    subscriptionCount = (await listSubscriptions()).length;
  } catch {
    subscriptionCount = 0;
  }

  const mode = await resolveAppMode();
  let legacyClaimAvailable = false;
  try {
    legacyClaimAvailable = mode === "multi" && (await isLegacyClaimAvailable());
  } catch {
    legacyClaimAvailable = false;
  }

  return json({
    ok: true,
    service: "agent-notify",
    vapidConfigured: vapidConfigured(env),
    agentTokenConfigured: Boolean(env.agentApiToken),
    ownerSetupRequired: Boolean(env.ownerSetupSecret),
    subscriptionCount,
    multiAccount: mode === "multi",
    inviteRequired: Boolean(env.inviteCode),
    sessionSecretConfigured: Boolean(env.sessionSecret),
    legacyClaimAvailable,
  });
}

export const config: Config = {
  path: "/api/health",
  method: ["GET", "OPTIONS"],
};
