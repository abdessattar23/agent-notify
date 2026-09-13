import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { OS_ADAPTER_SCHEMA_VERSION } from "../../shared/os-adapter.ts";
import { handleOsAdapterRequest, redactOsAudit } from "./os-adapter.ts";
import type { BlobStore } from "./store.ts";

function memoryStore(): BlobStore {
  const data = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (data.get(key) as T | undefined) ?? null;
    },
    async setJSON(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    async listKeys() {
      return [...data.keys()];
    },
  };
}

function enabledEnv(overrides: Record<string, string> = {}) {
  return {
    AGENT_NOTIFY_OS_ADAPTER: "true",
    AGENT_NOTIFY_OS_BOTS: "personal-ops:bot-secret-token",
    AGENT_NOTIFY_OS_LIVE_PUSH: "false",
    ...overrides,
  };
}

function attentionBody(overrides: Record<string, unknown> = {}) {
  return {
    tool: "request_user_attention",
    schemaVersion: OS_ADAPTER_SCHEMA_VERSION,
    idempotencyKey: "idem-key-001",
    botId: "personal-ops",
    timestamp: "2026-09-13T12:00:00.000Z",
    nonce: "nonce-abc-001",
    summary: "job poller stale",
    reason: "stale",
    urgency: "normal",
    ...overrides,
  };
}

function request(body: unknown, token = "bot-secret-token"): Request {
  return new Request("https://example.com/api/os-adapter", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function call(
  body: unknown,
  options?: {
    token?: string;
    env?: Record<string, string | undefined>;
    store?: BlobStore;
    now?: Date;
    sendPush?: () => Promise<{ delivered: number; failed: number; pruned: number; errors: string[] }>;
  },
) {
  const store = options?.store ?? memoryStore();
  const response = await handleOsAdapterRequest(request(body, options?.token), {
    env: options?.env ?? enabledEnv(),
    store,
    now: () => options?.now ?? new Date("2026-09-13T12:00:05.000Z"),
    sendPush: options?.sendPush,
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { response, json, store };
}

describe("os adapter request handler", () => {
  afterEach(() => {
    delete process.env.AGENT_NOTIFY_OS_ADAPTER;
    delete process.env.AGENT_NOTIFY_OS_BOTS;
    delete process.env.AGENT_NOTIFY_OS_LIVE_PUSH;
  });

  it("refuses when the adapter is disabled even with a valid bot token", async () => {
    const { response, json } = await call(attentionBody(), {
      env: { AGENT_NOTIFY_OS_BOTS: "personal-ops:bot-secret-token" },
    });
    assert.equal(response.status, 403);
    assert.equal(json.error, "os_adapter_disabled");
  });

  it("rejects a missing or wrong bearer token", async () => {
    const missing = await call(attentionBody(), { token: "" });
    assert.equal(missing.response.status, 401);

    const wrong = await call(attentionBody(), { token: "wrong-token" });
    assert.equal(wrong.response.status, 401);
    assert.equal(wrong.json.error, "unauthorized");
  });

  it("accepts a matching allowlisted bot bearer token", async () => {
    const { response, json } = await call(attentionBody());
    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.livePush, "dry_run");
    assert.equal(json.schemaVersion, OS_ADAPTER_SCHEMA_VERSION);
  });

  it("rejects a mismatched schema version", async () => {
    const { response, json } = await call(attentionBody({ schemaVersion: "9.9.9" }));
    assert.equal(response.status, 400);
    assert.equal(json.error, "unsupported_schema_version");
  });

  it("rejects a stale timestamp outside the replay window", async () => {
    const { response, json } = await call(
      attentionBody({ timestamp: "2026-09-13T11:50:00.000Z" }),
      { now: new Date("2026-09-13T12:00:05.000Z") },
    );
    assert.equal(response.status, 400);
    assert.equal(json.error, "timestamp_out_of_window");
  });

  it("rejects a reused nonce as replay", async () => {
    const store = memoryStore();
    const first = await call(attentionBody(), { store });
    assert.equal(first.response.status, 200);

    const replay = await call(
      attentionBody({ idempotencyKey: "idem-key-002", summary: "job poller still stale" }),
      { store },
    );
    assert.equal(replay.response.status, 409);
    assert.equal(replay.json.error, "replay_detected");
  });

  it("returns the stored result for a repeated idempotency key", async () => {
    const store = memoryStore();
    const first = await call(attentionBody(), { store });
    assert.equal(first.response.status, 200);
    const replay = await call(attentionBody({ nonce: "nonce-abc-002" }), { store });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.json.idempotentReplay, true);
    assert.equal(replay.json.eventId, first.json.eventId);
  });

  it("rate limits per bot", async () => {
    const store = memoryStore();
    const env = enabledEnv({ AGENT_NOTIFY_OS_RATE_LIMIT_PER_HOUR: "2" });
    const one = await call(attentionBody({ nonce: "nonce-rate-1", idempotencyKey: "idem-rate-1" }), { store, env });
    const two = await call(attentionBody({ nonce: "nonce-rate-2", idempotencyKey: "idem-rate-2" }), { store, env });
    const three = await call(attentionBody({ nonce: "nonce-rate-3", idempotencyKey: "idem-rate-3" }), { store, env });
    assert.equal(one.response.status, 200);
    assert.equal(two.response.status, 200);
    assert.equal(three.response.status, 429);
    assert.equal(three.json.error, "rate_limited");
  });

  it("keeps audit records redacted", async () => {
    const store = memoryStore();
    await call(
      attentionBody({
        summary: "job poller stale",
        note: "not a field on this tool",
      }),
      { store },
    );
    const keys = await store.listKeys();
    const auditKey = keys.find((key) => key.startsWith("audit:"));
    assert.ok(auditKey);
    const audit = await store.getJSON<Record<string, unknown>>(auditKey!);
    assert.ok(audit);
    const encoded = JSON.stringify(audit);
    assert.doesNotMatch(encoded, /bot-secret-token/);
    assert.doesNotMatch(encoded, /Bearer/);
    assert.equal(typeof audit.summaryLength, "number");
    assert.equal(audit.summary, undefined);
    assert.equal(audit.note, undefined);
    assert.ok(Array.isArray(audit.fieldNames));
    assert.equal(audit.schemaVersion, OS_ADAPTER_SCHEMA_VERSION);
  });

  it("does not send live Web Push when the notify gate is off", async () => {
    let pushed = 0;
    const { json } = await call(attentionBody(), {
      sendPush: async () => {
        pushed += 1;
        return { delivered: 1, failed: 0, pruned: 0, errors: [] };
      },
    });
    assert.equal(pushed, 0);
    assert.equal(json.livePush, "dry_run");
  });

  it("stores request_approval options and accepts a matching acknowledge choice", async () => {
    const store = memoryStore();
    const approval = await call(
      {
        tool: "request_approval",
        schemaVersion: OS_ADAPTER_SCHEMA_VERSION,
        idempotencyKey: "idem-appr-1",
        botId: "personal-ops",
        timestamp: "2026-09-13T12:00:00.000Z",
        nonce: "nonce-appr-1",
        summary: "submit the CFP",
        decisionId: "dec-cfp-1",
        options: [
          { id: "submit", label: "Submit" },
          { id: "skip", label: "Skip" },
        ],
      },
      { store },
    );
    assert.equal(approval.response.status, 200);
    assert.equal(approval.json.schemaVersion, OS_ADAPTER_SCHEMA_VERSION);

    const ack = await call(
      {
        tool: "acknowledge_decision",
        schemaVersion: OS_ADAPTER_SCHEMA_VERSION,
        idempotencyKey: "idem-ack-1",
        botId: "personal-ops",
        timestamp: "2026-09-13T12:00:00.000Z",
        nonce: "nonce-ack-1",
        summary: "chose submit",
        decisionId: "dec-cfp-1",
        choice: "submit",
      },
      { store },
    );
    assert.equal(ack.response.status, 200);
    assert.equal(ack.json.choice, "submit");
    assert.equal(ack.json.schemaVersion, OS_ADAPTER_SCHEMA_VERSION);
  });

  it("rejects an acknowledge choice that matches neither a prior option nor the allowlist", async () => {
    const store = memoryStore();
    await call(
      {
        tool: "request_approval",
        schemaVersion: OS_ADAPTER_SCHEMA_VERSION,
        idempotencyKey: "idem-appr-2",
        botId: "personal-ops",
        timestamp: "2026-09-13T12:00:00.000Z",
        nonce: "nonce-appr-2",
        summary: "submit the CFP",
        decisionId: "dec-cfp-2",
        options: [{ id: "submit", label: "Submit" }],
      },
      { store },
    );
    const ack = await call(
      {
        tool: "acknowledge_decision",
        schemaVersion: OS_ADAPTER_SCHEMA_VERSION,
        idempotencyKey: "idem-ack-2",
        botId: "personal-ops",
        timestamp: "2026-09-13T12:00:00.000Z",
        nonce: "nonce-ack-2",
        summary: "bad choice",
        decisionId: "dec-cfp-2",
        choice: "wire-transfer",
      },
      { store },
    );
    assert.equal(ack.response.status, 400);
    assert.equal(ack.json.error, "choice_not_allowed");
  });
});

describe("redactOsAudit", () => {
  it("keeps metadata and drops raw text, tokens, and bodies", () => {
    const redacted = redactOsAudit({
      tool: "request_user_attention",
      botId: "personal-ops",
      schemaVersion: OS_ADAPTER_SCHEMA_VERSION,
      summary: "do not store this text",
      token: "super-secret",
      emailBody: "From: a@b.com",
      cv: "curriculum vitae",
    });
    assert.equal(redacted.botId, "personal-ops");
    assert.equal(redacted.tool, "request_user_attention");
    assert.equal(redacted.schemaVersion, OS_ADAPTER_SCHEMA_VERSION);
    assert.equal(redacted.summaryLength, "do not store this text".length);
    assert.equal("summary" in redacted, false);
    assert.equal("token" in redacted, false);
    assert.equal("emailBody" in redacted, false);
    assert.equal("cv" in redacted, false);
  });
});
