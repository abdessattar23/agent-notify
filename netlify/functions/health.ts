import type { Config, Context } from "@netlify/functions";
import { getRuntimeEnv, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { personalOsSeedAllowed } from "../lib/personal-os.ts";
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

  return json({
    ok: true,
    service: "agent-notify",
    vapidConfigured: vapidConfigured(env),
    agentTokenConfigured: Boolean(env.agentApiToken),
    ownerSetupRequired: Boolean(env.ownerSetupSecret),
    subscriptionCount,
    personalOsBotsConfigured: Object.keys(env.personalOsBotTokens).length > 0,
    personalOsNotifyEnabled: env.personalOsNotifyEnabled,
    personalOsSeedAllowed: personalOsSeedAllowed({
      allowSeed: env.personalOsAllowSeed,
      context: env.deployContext,
      siteUrl: env.siteUrl,
    }),
  });
}

export const config: Config = {
  path: "/api/health",
  method: ["GET", "OPTIONS"],
};
