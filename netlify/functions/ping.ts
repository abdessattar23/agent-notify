import type { Config, Context } from "@netlify/functions";
import { requireOwnerAccess } from "../lib/auth.ts";
import { getRuntimeEnv, resolveSiteUrl, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { sendToAllSubscriptions } from "../lib/push.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return ping(req);
    default:
      return methodNotAllowed(["POST", "OPTIONS"]);
  }
}

async function ping(req: Request): Promise<Response> {
  const env = getRuntimeEnv();
  if (!vapidConfigured(env)) {
    return json({ ok: false, error: "vapid_unconfigured" }, 503);
  }

  const auth = requireOwnerAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const origin = resolveSiteUrl(req, env);
  const summary = await sendToAllSubscriptions(
    {
      title: "Agent Notify test ping",
      body: "Push is working. Your agents can reach this iPhone.",
      url: "/",
      tag: "agent-notify-test",
    },
    origin,
  );

  if (summary.delivered === 0 && summary.failed === 0 && summary.pruned === 0) {
    return json({ ok: false, error: "no_subscriptions", ...summary }, 409);
  }

  return json({ ok: summary.failed === 0, ...summary }, summary.failed === 0 ? 200 : 207);
}

export const config: Config = {
  path: "/api/ping",
  method: ["POST", "OPTIONS"],
};
