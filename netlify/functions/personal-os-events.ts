import type { Config, Context } from "@netlify/functions";
import { decidePersonalOsNotify, parsePersonalOsEvent } from "../../shared/personal-os.ts";
import { requirePersonalOsBot } from "../lib/auth.ts";
import { getRuntimeEnv, resolveSiteUrl, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse, readJson } from "../lib/http.ts";
import { ingestPersonalOsEvent } from "../lib/personal-os.ts";
import { sendToAllSubscriptions } from "../lib/push.ts";
import { rateLimitHeaders } from "../lib/rate-limit.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return ingest(req);
    default:
      return methodNotAllowed(["POST", "OPTIONS"]);
  }
}

async function ingest(req: Request): Promise<Response> {
  const env = getRuntimeEnv();
  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400);
  }

  const parsed = parsePersonalOsEvent(body.value);
  if ("error" in parsed) {
    return json({ ok: false, error: parsed.error }, 400);
  }

  const auth = requirePersonalOsBot(req, parsed.sourceBot);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const result = await ingestPersonalOsEvent(parsed, {
    now: new Date(),
    retentionDays: env.personalOsRetentionDays,
    rateLimit: env.personalOsRateLimitPerHour,
  });

  if (!result.ok) {
    return json(
      { ok: false, error: result.error, retryAfter: result.retryAfter },
      result.status,
      result.retryAfter
        ? rateLimitHeaders({
            ok: false,
            remaining: 0,
            limit: env.personalOsRateLimitPerHour,
            resetEpochSec: result.retryAfter,
          })
        : undefined,
    );
  }

  if (!result.idempotent) {
    await maybeNotify(req, parsed);
  }

  return json({
    ok: true,
    eventId: result.eventId,
    idempotent: result.idempotent,
    notify: result.notify,
  });
}

async function maybeNotify(req: Request, event: ReturnType<typeof parsePersonalOsEvent>): Promise<void> {
  if ("error" in event) return;
  const env = getRuntimeEnv();
  if (!env.personalOsNotifyEnabled || !vapidConfigured(env)) return;
  const decision = decidePersonalOsNotify(event);
  if (!decision.notify) return;
  try {
    await sendToAllSubscriptions(
      {
        title: `[Personal OS] ${event.title}`,
        body: event.impact ?? event.nextAction ?? decision.reason,
        url: "/os",
        tag: `personal-os-${event.eventId}`,
        default_action: event.sourceUrl
          ? { type: "link", title: "Source", url: event.sourceUrl }
          : { type: "link", title: "Dashboard", url: "/os" },
      },
      resolveSiteUrl(req, env),
    );
  } catch {
    // Ingest already succeeded; notify is best-effort and env-gated.
  }
}

export const config: Config = {
  path: "/api/personal-os/events",
  method: ["POST", "OPTIONS"],
};
