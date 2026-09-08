import type { Config, Context } from "@netlify/functions";
import { parseNotifyBody } from "../../shared/notify.ts";
import { normalizeTopicName } from "../../shared/topics.ts";
import { resolveAgentAuth } from "../lib/auth.ts";
import { getRuntimeEnv, resolveSiteUrl, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse, readJson } from "../lib/http.ts";
import { consumeAgentRateLimit, rateLimitHeaders } from "../lib/rate-limit.ts";
import { sendToAccount, sendToAllSubscriptions } from "../lib/push.ts";

export default async function handler(req: Request, context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return notify(req, context);
    default:
      return methodNotAllowed(["POST", "OPTIONS"]);
  }
}

async function notify(req: Request, context: Context): Promise<Response> {
  const env = getRuntimeEnv();
  if (!vapidConfigured(env)) {
    return json({ ok: false, error: "vapid_unconfigured" }, 503);
  }

  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const accountId = auth.mode === "multi" ? auth.accountId : undefined;
  const limit = await consumeAgentRateLimit(env.rateLimitPerHour, accountId);
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

  const pathTopic = pathTopicName(context);
  if (typeof pathTopic === "object") {
    return json({ ok: false, error: pathTopic.error }, 400, rateLimitHeaders(limit));
  }
  const topic = pathTopic ?? parsed.topic;

  const origin = resolveSiteUrl(req, env);
  const summary =
    auth.mode === "multi"
      ? await sendToAccount(auth.accountId, parsed, origin, { topic })
      : await sendToAllSubscriptions(parsed, origin);
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
      ...(topic ? { topic } : {}),
    },
    summary.failed === 0 ? 200 : 207,
    rateLimitHeaders(limit),
  );
}

function pathTopicName(context: Context): string | undefined | { error: string } {
  const value = context.params?.topic;
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (!raw) return undefined;
  return normalizeTopicName(decodeURIComponent(raw));
}

export const config: Config = {
  path: ["/v1/notify", "/v1/t/:topic"],
  method: ["POST", "OPTIONS"],
};
