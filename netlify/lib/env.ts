export type RuntimeEnv = {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  agentApiToken: string;
  ownerSetupSecret: string | null;
  siteUrl: string;
  rateLimitPerHour: number;
  personalOsBotTokens: Record<string, string>;
  personalOsRateLimitPerHour: number;
  personalOsRetentionDays: number;
  personalOsNotifyEnabled: boolean;
  personalOsAllowSeed: boolean;
  deployContext: string;
  deployUrl: string;
  deployPrimeUrl: string;
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
  const personalRateRaw = process.env.PERSONAL_OS_RATE_LIMIT_PER_HOUR ?? "60";
  const personalOsRateLimitPerHour = Number.parseInt(personalRateRaw, 10);
  const retentionRaw = process.env.PERSONAL_OS_RETENTION_DAYS ?? "90";
  const personalOsRetentionDays = Number.parseInt(retentionRaw, 10);
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
    personalOsBotTokens: parsePersonalOsBotTokens(),
    personalOsRateLimitPerHour:
      Number.isFinite(personalOsRateLimitPerHour) && personalOsRateLimitPerHour > 0
        ? personalOsRateLimitPerHour
        : 60,
    personalOsRetentionDays:
      Number.isFinite(personalOsRetentionDays) && personalOsRetentionDays > 0
        ? personalOsRetentionDays
        : 90,
    personalOsNotifyEnabled: isTruthy(process.env.PERSONAL_OS_NOTIFY_ENABLED),
    personalOsAllowSeed: isTruthy(process.env.PERSONAL_OS_ALLOW_SEED),
    deployContext: (process.env.CONTEXT || process.env.DEPLOY_CONTEXT || "").trim().toLowerCase(),
    deployUrl: (process.env.DEPLOY_URL || "").replace(/\/$/, ""),
    deployPrimeUrl: (process.env.DEPLOY_PRIME_URL || "").replace(/\/$/, ""),
  };
}

export function parsePersonalOsBotTokens(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  const json = env.PERSONAL_OS_BOT_TOKENS?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "string" && value.trim()) {
            tokens[key.trim()] = value.trim();
          }
        }
      }
    } catch {
      // Individual PERSONAL_OS_TOKEN_* vars still apply.
    }
  }
  const prefix = "PERSONAL_OS_TOKEN_";
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix) || !value?.trim()) continue;
    const bot = key.slice(prefix.length).toLowerCase().replace(/_/g, "-");
    tokens[bot] = value.trim();
  }
  return tokens;
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

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
