import type { Config, Context } from "@netlify/functions";
import { parseNotifyBody } from "../../shared/notify.ts";
import { requireAgentToken } from "../lib/auth.ts";
import { getRuntimeEnv, resolveSiteUrl, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse, readJson } from "../lib/http.ts";
import { consumeAgentRateLimit, rateLimitHeaders } from "../lib/rate-limit.ts";
import { sendToAllSubscriptions } from "../lib/push.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return notify(req);
    default:
      return methodNotAllowed(["POST", "OPTIONS"]);
  }
}

async function notify(req: Request): Promise<Response> {
  const env = getRuntimeEnv();
  if (!vapidConfigured(env)) {
    return json({ ok: false, error: "vapid_unconfigured" }, 503);
  }

  const auth = requireAgentToken(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const limit = await consumeAgentRateLimit(env.rateLimitPerHour);
  if (!limit.ok) {
    return json(
      { ok: false, error: "rate_limited", retryAfter: limit.resetEpochSec },
      429,
      rateLimitHeaders(limit),
    );
  }

  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400, rateLimitHeaders(limit));
  }

  const parsed = parseNotifyBody(body.value);
  if ("error" in parsed) {
    return json({ ok: false, error: parsed.error }, 400, rateLimitHeaders(limit));
  }

  const origin = resolveSiteUrl(req, env);
  const summary = await sendToAllSubscriptions(parsed, origin);
  if (summary.delivered === 0 && summary.failed === 0 && summary.pruned === 0) {
    return json(
      { ok: false, error: "no_subscriptions", ...summary },
      409,
      rateLimitHeaders(limit),
    );
  }

  return json(
    {
      ok: summary.failed === 0,
      ...summary,
    },
    summary.failed === 0 ? 200 : 207,
    rateLimitHeaders(limit),
  );
}

export const config: Config = {
  path: "/v1/notify",
  method: ["POST", "OPTIONS"],
};
