export const OS_ADAPTER_SCHEMA_VERSION = "1.0.0";

const OS_ADAPTER_TOOLS = [
  {
    name: "publish_dashboard_event",
    description:
      "Record a Personal OS dashboard event (store-only unless live push is separately enabled). Destination is server-configured. No URLs, recipients, or credentials.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "idempotencyKey", "botId", "timestamp", "nonce", "summary", "area", "status", "title"],
      properties: {
        schemaVersion: { type: "string", enum: [OS_ADAPTER_SCHEMA_VERSION] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
        botId: { type: "string", minLength: 2, maxLength: 64 },
        timestamp: { type: "string", description: "UTC ISO-8601 timestamp" },
        nonce: { type: "string", minLength: 8, maxLength: 128 },
        summary: { type: "string", minLength: 1, maxLength: 200 },
        area: { type: "string", enum: ["otel", "cfp", "jobs", "talks", "missions", "personal-ops"] },
        status: { type: "string", enum: ["info", "success", "warning", "blocked", "failed"] },
        title: { type: "string", minLength: 1, maxLength: 120 },
        impact: { type: "string", maxLength: 200 },
        nextAction: { type: "string", maxLength: 200 },
        decisionNeeded: { type: "boolean" },
        approvalNeeded: { type: "boolean" },
        metricDelta: {
          type: "object",
          additionalProperties: false,
          required: ["metric", "delta"],
          properties: {
            metric: { type: "string", enum: ["otel", "cfp", "jobs", "talks", "missions", "personal-ops"] },
            delta: { type: "number" },
          },
        },
      },
    },
  },
  {
    name: "request_user_attention",
    description:
      "Ask the owner to look at a Personal OS outcome. Live Web Push is env-gated and off by default (dry-run/store-only).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "idempotencyKey", "botId", "timestamp", "nonce", "summary", "reason", "urgency"],
      properties: {
        schemaVersion: { type: "string", enum: [OS_ADAPTER_SCHEMA_VERSION] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
        botId: { type: "string", minLength: 2, maxLength: 64 },
        timestamp: { type: "string" },
        nonce: { type: "string", minLength: 8, maxLength: 128 },
        summary: { type: "string", minLength: 1, maxLength: 200 },
        reason: { type: "string", enum: ["deadline", "failure", "stale", "high_value", "other"] },
        urgency: { type: "string", enum: ["low", "normal", "high"] },
      },
    },
  },
  {
    name: "request_approval",
    description:
      "Request a bounded owner decision. Options are {id,label} only. No URLs or recipients. Live push is separately gated.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "idempotencyKey", "botId", "timestamp", "nonce", "summary", "decisionId", "options"],
      properties: {
        schemaVersion: { type: "string", enum: [OS_ADAPTER_SCHEMA_VERSION] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
        botId: { type: "string", minLength: 2, maxLength: 64 },
        timestamp: { type: "string" },
        nonce: { type: "string", minLength: 8, maxLength: 128 },
        summary: { type: "string", minLength: 1, maxLength: 200 },
        decisionId: { type: "string", minLength: 2, maxLength: 64 },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label"],
            properties: {
              id: { type: "string", minLength: 1, maxLength: 32 },
              label: { type: "string", minLength: 1, maxLength: 40 },
            },
          },
        },
        expiresAt: { type: "string" },
      },
    },
  },
  {
    name: "acknowledge_decision",
    description:
      "Record the owner's choice for a prior decision. Choice must match a stored option id or an allowlisted choice.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "idempotencyKey", "botId", "timestamp", "nonce", "summary", "decisionId", "choice"],
      properties: {
        schemaVersion: { type: "string", enum: [OS_ADAPTER_SCHEMA_VERSION] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
        botId: { type: "string", minLength: 2, maxLength: 64 },
        timestamp: { type: "string" },
        nonce: { type: "string", minLength: 8, maxLength: 128 },
        summary: { type: "string", minLength: 1, maxLength: 200 },
        decisionId: { type: "string", minLength: 2, maxLength: 64 },
        choice: { type: "string", minLength: 1, maxLength: 32 },
        note: { type: "string", maxLength: 200 },
      },
    },
  },
];

const OS_TOOL_NAMES = new Set(OS_ADAPTER_TOOLS.map((tool) => tool.name));

function flagEnabled(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isOsAdapterEnabled(env = process.env) {
  return flagEnabled(env.AGENT_NOTIFY_OS_ADAPTER);
}

export function isOsAdapterTool(name) {
  return OS_TOOL_NAMES.has(name);
}

export function listOsAdapterTools(env = process.env) {
  if (!isOsAdapterEnabled(env)) return [];
  return OS_ADAPTER_TOOLS;
}

export async function callOsAdapterTool(name, args) {
  if (!isOsAdapterEnabled()) {
    throw new Error("os_adapter_disabled");
  }
  const site = (process.env.AGENT_NOTIFY_SITE || process.env.SITE_URL || "").replace(/\/$/, "");
  const token = process.env.AGENT_NOTIFY_OS_BOT_TOKEN || process.env.AGENT_API_TOKEN || "";
  if (!site) {
    throw new Error("AGENT_NOTIFY_SITE (or SITE_URL) is not set");
  }
  if (!token) {
    throw new Error("AGENT_NOTIFY_OS_BOT_TOKEN (or AGENT_API_TOKEN) is not set");
  }
  const res = await fetch(`${site}/api/os-adapter`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tool: name, ...args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `os adapter failed (${res.status})`);
  }
  return data;
}
