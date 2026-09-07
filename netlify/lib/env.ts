export type RuntimeEnv = {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  agentApiToken: string;
  ownerSetupSecret: string | null;
  siteUrl: string;
  rateLimitPerHour: number;
};

let cached: RuntimeEnv | null = null;

export function getRuntimeEnv(): RuntimeEnv {
  if (cached) return cached;
  cached = readRuntimeEnv();
  return cached;
}

export function resetRuntimeEnvCache(): void {
  cached = null;
}

export function readRuntimeEnv(): RuntimeEnv {
  const rateLimitRaw = process.env.RATE_LIMIT_PER_HOUR ?? "30";
  const rateLimitPerHour = Number.parseInt(rateLimitRaw, 10);
  return {
    vapidPublicKey: (process.env.VAPID_PUBLIC_KEY ?? "").trim(),
    vapidPrivateKey: (process.env.VAPID_PRIVATE_KEY ?? "").trim(),
    vapidSubject: (process.env.VAPID_SUBJECT ?? "").trim(),
    agentApiToken: (process.env.AGENT_API_TOKEN ?? "").trim(),
    ownerSetupSecret: emptyToNull(process.env.OWNER_SETUP_SECRET),
    siteUrl: (process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(
      /\/$/,
      "",
    ),
    rateLimitPerHour: Number.isFinite(rateLimitPerHour) && rateLimitPerHour > 0 ? rateLimitPerHour : 30,
  };
}

export function vapidConfigured(env: RuntimeEnv = getRuntimeEnv()): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);
}

export function resolveSiteUrl(req: Request, env: RuntimeEnv = getRuntimeEnv()): string {
  if (env.siteUrl) return env.siteUrl;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
