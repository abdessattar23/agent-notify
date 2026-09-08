export type RuntimeEnv = {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  agentApiToken: string;
  ownerSetupSecret: string | null;
  siteUrl: string;
  rateLimitPerHour: number;
  multiAccount: boolean;
  sessionSecret: string | null;
  inviteCode: string | null;
  signupRateLimitPerHour: number;
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
  const signupLimitRaw = process.env.SIGNUP_RATE_LIMIT_PER_HOUR ?? "5";
  const signupRateLimitPerHour = Number.parseInt(signupLimitRaw, 10);
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
    multiAccount: parseBool(process.env.MULTI_ACCOUNT),
    sessionSecret: emptyToNull(process.env.SESSION_SECRET),
    inviteCode: emptyToNull(process.env.INVITE_CODE),
    signupRateLimitPerHour:
      Number.isFinite(signupRateLimitPerHour) && signupRateLimitPerHour > 0
        ? signupRateLimitPerHour
        : 5,
  };
}

function parseBool(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
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
