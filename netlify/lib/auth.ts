import { createHash, timingSafeEqual } from "node:crypto";
import { getAccount, hashToken, lookupTokenAccount, touchToken } from "./accounts.ts";
import { getRuntimeEnv } from "./env.ts";
import { resolveAppMode } from "./mode.ts";
import { loadSession } from "./session.ts";

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export type AgentAuth =
  | { ok: true; mode: "solo" }
  | { ok: true; mode: "multi"; accountId: string }
  | { ok: false; status: 401 | 503; error: string };

export type OwnerAuth =
  | { ok: true; mode: "solo" }
  | { ok: true; mode: "multi"; accountId: string }
  | { ok: false; status: 401 | 503; error: string };

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1] ?? null;
}

export function requireAgentToken(req: Request): AuthResult {
  const env = getRuntimeEnv();
  if (!env.agentApiToken) {
    return { ok: false, status: 503, error: "agent_token_unconfigured" };
  }
  const token = bearerToken(req);
  if (!token || !secretsEqual(token, env.agentApiToken)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export function requireOwnerAccess(req: Request): AuthResult {
  const env = getRuntimeEnv();
  if (!env.ownerSetupSecret) {
    return { ok: true };
  }
  const headerSecret = req.headers.get("x-owner-secret");
  const token = bearerToken(req);
  const provided = headerSecret || token;
  if (!provided || !secretsEqual(provided, env.ownerSetupSecret)) {
    return { ok: false, status: 401, error: "owner_secret_required" };
  }
  return { ok: true };
}

export function secretsEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function resolveAgentAuth(req: Request): Promise<AgentAuth> {
  const mode = await resolveAppMode();
  if (mode === "solo") {
    const result = requireAgentToken(req);
    if (!result.ok) return result;
    return { ok: true, mode: "solo" };
  }

  const token = bearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const accountId = await lookupTokenAccount(hashToken(token));
  if (!accountId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const account = await getAccount(accountId);
  if (!account) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  await touchToken(accountId, hashToken(token)).catch(() => undefined);
  return { ok: true, mode: "multi", accountId };
}

export async function requireAccountAccess(req: Request): Promise<OwnerAuth> {
  const mode = await resolveAppMode();
  if (mode === "solo") {
    const owner = requireOwnerAccess(req);
    if (!owner.ok) return owner;
    return { ok: true, mode: "solo" };
  }
  const session = await loadSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "session_required" };
  }
  return { ok: true, mode: "multi", accountId: session.accountId };
}
