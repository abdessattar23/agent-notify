import { createHash, timingSafeEqual } from "node:crypto";
import { getRuntimeEnv } from "./env.ts";

export type AuthResult =
  | { ok: true }
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
