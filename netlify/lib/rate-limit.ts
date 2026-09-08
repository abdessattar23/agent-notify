import { createHash } from "node:crypto";
import { rateLimitStoreKey } from "./accounts.ts";
import { namedStore, tokensStore, type BlobStore } from "./store.ts";

export type RateLimitDecision =
  | { ok: true; remaining: number; limit: number; resetEpochSec: number }
  | { ok: false; remaining: 0; limit: number; resetEpochSec: number };

type WindowRecord = {
  count: number;
  window: string;
};

export function hourWindow(now = new Date()): { id: string; resetEpochSec: number } {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const reset = Date.UTC(year, now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0);
  return { id: `${year}-${month}-${day}T${hour}`, resetEpochSec: Math.floor(reset / 1000) };
}

export function nextCount(existing: WindowRecord | null, windowId: string): number {
  if (!existing || existing.window !== windowId) return 1;
  return existing.count + 1;
}

async function consumeWindow(
  store: BlobStore,
  key: string,
  limit: number,
): Promise<RateLimitDecision> {
  const { id, resetEpochSec } = hourWindow();
  const existing = await store.getJSON<WindowRecord>(key);
  const count = nextCount(existing, id);
  if (count > limit) {
    return { ok: false, remaining: 0, limit, resetEpochSec };
  }
  await store.setJSON(key, { count, window: id, lastUsedAt: new Date().toISOString() });
  return { ok: true, remaining: Math.max(0, limit - count), limit, resetEpochSec };
}

export async function consumeAgentRateLimit(
  limit: number,
  accountId?: string,
): Promise<RateLimitDecision> {
  if (accountId) {
    return consumeWindow(namedStore("accounts"), rateLimitStoreKey(accountId), limit);
  }
  return consumeWindow(tokensStore(), "agent-hourly", limit);
}

export async function consumeSignupRateLimit(limit: number, ip: string): Promise<RateLimitDecision> {
  const hashed = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  return consumeWindow(tokensStore(), `signup-hourly/${hashed}`, limit);
}

export function rateLimitHeaders(decision: RateLimitDecision): HeadersInit {
  return {
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-reset": String(decision.resetEpochSec),
    ...(decision.ok ? {} : { "retry-after": String(Math.max(1, decision.resetEpochSec - Math.floor(Date.now() / 1000))) }),
  };
}
