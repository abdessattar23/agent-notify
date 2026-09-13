import {
  DEFAULT_OS_RATE_LIMIT,
  DEFAULT_REPLAY_WINDOW_SEC,
  OS_BOTS_ENV,
  OS_RATE_LIMIT_ENV,
  OS_REPLAY_WINDOW_ENV,
  isOsAdapterEnabled,
  isOsAllowlistedChoice,
  isOsLivePushEnabled,
  parseOsAdapterRequest,
  type OsAdapterRequest,
} from "../../shared/os-adapter.ts";
import type { NotifyInput } from "../../shared/notify.ts";
import { bearerToken, secretsEqual } from "./auth.ts";
import { json } from "./http.ts";
import { hourWindow, nextCount } from "./rate-limit.ts";
import { osAdapterStore, type BlobStore } from "./store.ts";

export type OsAdapterDeps = {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  store?: BlobStore;
  now?: () => Date;
  sendPush?: (input: NotifyInput, origin: string) => Promise<OsPushSummary>;
  origin?: string;
};

export type OsPushSummary = {
  delivered: number;
  failed: number;
  pruned: number;
  errors: string[];
  id?: string;
};

export type OsAuditRecord = {
  at: string;
  botId?: string;
  tool?: string;
  schemaVersion?: string;
  outcome: "accepted" | "rejected";
  error?: string;
  summaryLength: number;
  fieldNames: string[];
  livePush?: string;
};

type RateRecord = {
  count: number;
  window: string;
};

type IdempotencyRecord = {
  eventId: string;
  result: Record<string, unknown>;
};

type DecisionRecord = {
  options: Array<{ id: string; label: string }>;
  expiresAt?: string;
};

type NonceRecord = {
  at: string;
};

const SENSITIVE_AUDIT_KEYS = new Set([
  "token",
  "authorization",
  "secret",
  "password",
  "credential",
  "credentials",
  "emailBody",
  "email",
  "cv",
  "note",
  "summary",
  "impact",
  "nextAction",
  "title",
]);

export async function handleOsAdapterRequest(req: Request, deps: OsAdapterDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  if (!isOsAdapterEnabled(env)) {
    return json({ ok: false, error: "os_adapter_disabled" }, 403);
  }

  const store = deps.store ?? osAdapterStore();
  const now = deps.now ?? (() => new Date());
  const current = now();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reject(store, current, {}, "invalid JSON", 400);
  }

  const parsed = parseOsAdapterRequest(raw);
  if (!parsed.ok) {
    return reject(store, current, raw, parsed.error, 400);
  }

  const body = parsed.value;
  const auth = authenticateOsBot(req, body.botId, env);
  if (!auth.ok) {
    return reject(store, current, body, auth.error, auth.status);
  }

  const windowSec = readPositiveInt(env[OS_REPLAY_WINDOW_ENV], DEFAULT_REPLAY_WINDOW_SEC);
  const skewMs = Math.abs(current.getTime() - Date.parse(body.timestamp));
  if (skewMs > windowSec * 1000) {
    return reject(store, current, body, "timestamp_out_of_window", 400);
  }

  const idemKey = `idem:${body.botId}:${body.idempotencyKey}`;
  const existingIdem = await store.getJSON<IdempotencyRecord>(idemKey);
  if (existingIdem?.result) {
    return json({ ...existingIdem.result, idempotentReplay: true });
  }

  const nonceKey = `nonce:${body.botId}:${body.nonce}`;
  const existingNonce = await store.getJSON<NonceRecord>(nonceKey);
  if (existingNonce) {
    return reject(store, current, body, "replay_detected", 409);
  }

  const limit = readPositiveInt(env[OS_RATE_LIMIT_ENV], DEFAULT_OS_RATE_LIMIT);
  const rate = await consumeBotRateLimit(store, body.botId, limit, current);
  if (!rate.ok) {
    return json({ ok: false, error: "rate_limited", retryAfter: rate.resetEpochSec }, 429);
  }

  await store.setJSON(nonceKey, { at: current.toISOString() });

  const eventId = createOsEventId();
  const toolResult = await applyTool(store, body, current);
  if (!toolResult.ok) {
    return reject(store, current, body, toolResult.error, 400);
  }

  const livePush = await maybePush(body, env, deps);
  const result = {
    ok: true,
    eventId,
    tool: body.tool,
    schemaVersion: body.schemaVersion,
    stored: true,
    livePush,
    ...toolResult.extra,
  };

  await store.setJSON(idemKey, { eventId, result });
  await store.setJSON(`event:${eventId}`, {
    eventId,
    tool: body.tool,
    botId: body.botId,
    schemaVersion: body.schemaVersion,
    at: current.toISOString(),
    livePush,
  });
  await writeAudit(store, current, redactOsAudit({ ...asRecord(body), livePush }), "accepted");
  return json(result);
}

export function authenticateOsBot(
  req: Request,
  botId: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const bots = parseBotAllowlist(env[OS_BOTS_ENV]);
  if (bots.size === 0) {
    return { ok: false, status: 503, error: "os_bots_unconfigured" };
  }
  const token = bearerToken(req);
  const mapped = bots.get(botId);
  const expected = mapped ?? "missing-os-bot-placeholder";
  if (!token || !secretsEqual(token, expected) || !mapped) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export function parseBotAllowlist(raw: string | undefined): Map<string, string> {
  const bots = new Map<string, string>();
  if (!raw) return bots;
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const id = trimmed.slice(0, sep).trim();
    const token = trimmed.slice(sep + 1).trim();
    if (id && token) bots.set(id, token);
  }
  return bots;
}

export function redactOsAudit(input: Record<string, unknown>): OsAuditRecord {
  const fieldNames = Object.keys(input).filter((key) => !SENSITIVE_AUDIT_KEYS.has(key));
  return {
    at: typeof input.at === "string" ? input.at : new Date().toISOString(),
    botId: typeof input.botId === "string" ? input.botId : undefined,
    tool: typeof input.tool === "string" ? input.tool : undefined,
    schemaVersion: typeof input.schemaVersion === "string" ? input.schemaVersion : undefined,
    outcome: input.outcome === "rejected" ? "rejected" : "accepted",
    error: typeof input.error === "string" ? input.error : undefined,
    summaryLength: typeof input.summary === "string" ? input.summary.length : 0,
    fieldNames,
    livePush: typeof input.livePush === "string" ? input.livePush : undefined,
  };
}

function createOsEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `os_${crypto.randomUUID()}`;
  }
  return `os_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function applyTool(
  store: BlobStore,
  body: OsAdapterRequest,
  now: Date,
): Promise<{ ok: true; extra: Record<string, unknown> } | { ok: false; error: string }> {
  switch (body.tool) {
    case "publish_dashboard_event":
      return { ok: true, extra: { area: body.area, status: body.status } };
    case "request_user_attention":
      return { ok: true, extra: { reason: body.reason, urgency: body.urgency } };
    case "request_approval": {
      if (body.expiresAt && Date.parse(body.expiresAt) <= now.getTime()) {
        return { ok: false, error: "expiresAt_in_the_past" };
      }
      await store.setJSON(`decision:${body.botId}:${body.decisionId}`, {
        options: body.options,
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      } satisfies DecisionRecord);
      return { ok: true, extra: { decisionId: body.decisionId } };
    }
    case "acknowledge_decision": {
      const decision = await store.getJSON<DecisionRecord>(`decision:${body.botId}:${body.decisionId}`);
      if (decision?.expiresAt && Date.parse(decision.expiresAt) <= now.getTime()) {
        return { ok: false, error: "decision_expired" };
      }
      const optionIds = new Set((decision?.options ?? []).map((option) => option.id));
      if (!optionIds.has(body.choice) && !isOsAllowlistedChoice(body.choice)) {
        return { ok: false, error: "choice_not_allowed" };
      }
      return { ok: true, extra: { decisionId: body.decisionId, choice: body.choice } };
    }
    default: {
      const unexpected: never = body;
      return { ok: false, error: `unknown tool: ${String(unexpected)}` };
    }
  }
}

async function maybePush(
  body: OsAdapterRequest,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  deps: OsAdapterDeps,
): Promise<string> {
  if (body.tool !== "request_user_attention" && body.tool !== "request_approval") {
    return "skipped";
  }
  if (!isOsLivePushEnabled(env)) {
    return "dry_run";
  }
  if (!deps.sendPush) {
    return "dry_run";
  }
  const input = constrainedNotify(body);
  try {
    await deps.sendPush(input, deps.origin ?? "https://localhost");
    return "sent";
  } catch {
    return "failed";
  }
}

function constrainedNotify(body: OsAdapterRequest): NotifyInput {
  switch (body.tool) {
    case "request_user_attention":
      return {
        title: "OS attention",
        body: `${body.reason} (${body.urgency})`,
        default_action: { type: "open_app", title: "Open" },
      };
    case "request_approval":
      return {
        title: "OS approval",
        body: `decision ${body.decisionId}`,
        default_action: { type: "open_app", title: "Open" },
      };
    case "publish_dashboard_event":
    case "acknowledge_decision":
      return {
        title: "OS event",
        default_action: { type: "open_app", title: "Open" },
      };
    default: {
      const unexpected: never = body;
      return { title: `OS ${String(unexpected)}` };
    }
  }
}

async function consumeBotRateLimit(
  store: BlobStore,
  botId: string,
  limit: number,
  now: Date,
): Promise<{ ok: true } | { ok: false; resetEpochSec: number }> {
  const { id, resetEpochSec } = hourWindow(now);
  const key = `rate:${botId}:${id}`;
  const existing = await store.getJSON<RateRecord>(key);
  const count = nextCount(existing, id);
  if (count > limit) {
    return { ok: false, resetEpochSec };
  }
  await store.setJSON(key, { count, window: id });
  return { ok: true };
}

async function reject(
  store: BlobStore,
  now: Date,
  raw: unknown,
  error: string,
  status: number,
): Promise<Response> {
  await writeAudit(store, now, redactOsAudit({ ...asRecord(raw), error }), "rejected");
  return json({ ok: false, error }, status);
}

async function writeAudit(store: BlobStore, now: Date, record: OsAuditRecord, outcome: "accepted" | "rejected"): Promise<void> {
  const id = createOsEventId();
  const day = now.toISOString().slice(0, 10);
  await store.setJSON(`audit:${day}:${id}`, { ...record, at: now.toISOString(), outcome });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
