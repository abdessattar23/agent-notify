export const OS_ADAPTER_TOOLS = [
  "publish_dashboard_event",
  "request_user_attention",
  "request_approval",
  "acknowledge_decision",
] as const;

export type OsAdapterToolName = (typeof OS_ADAPTER_TOOLS)[number];

export const OS_AREAS = ["otel", "cfp", "jobs", "talks", "missions", "personal-ops"] as const;
export type OsArea = (typeof OS_AREAS)[number];

export const OS_EVENT_STATUSES = ["info", "success", "warning", "blocked", "failed"] as const;
export type OsEventStatus = (typeof OS_EVENT_STATUSES)[number];

export const OS_ATTENTION_REASONS = ["deadline", "failure", "stale", "high_value", "other"] as const;
export type OsAttentionReason = (typeof OS_ATTENTION_REASONS)[number];

export const OS_ATTENTION_URGENCIES = ["low", "normal", "high"] as const;
export type OsAttentionUrgency = (typeof OS_ATTENTION_URGENCIES)[number];

export const OS_ALLOWLISTED_CHOICES = ["approve", "reject", "defer", "ack"] as const;
export type OsAllowlistedChoice = (typeof OS_ALLOWLISTED_CHOICES)[number];

export const OS_ADAPTER_ENV_FLAG = "AGENT_NOTIFY_OS_ADAPTER";
export const OS_LIVE_PUSH_ENV_FLAG = "AGENT_NOTIFY_OS_LIVE_PUSH";
export const OS_BOTS_ENV = "AGENT_NOTIFY_OS_BOTS";
export const OS_REPLAY_WINDOW_ENV = "AGENT_NOTIFY_OS_REPLAY_WINDOW_SEC";
export const OS_RATE_LIMIT_ENV = "AGENT_NOTIFY_OS_RATE_LIMIT_PER_HOUR";

export const DEFAULT_REPLAY_WINDOW_SEC = 300;
export const DEFAULT_OS_RATE_LIMIT = 20;
export const OS_ADAPTER_SCHEMA_VERSION = "1.0.0";
export const OS_ADAPTER_SCHEMA_VERSIONS = [OS_ADAPTER_SCHEMA_VERSION] as const;
export type OsAdapterSchemaVersion = (typeof OS_ADAPTER_SCHEMA_VERSIONS)[number];

const IDEMPOTENCY_MAX = 128;
const NONCE_MAX = 128;
const BOT_ID_MAX = 64;
const SUMMARY_MAX = 200;
const TITLE_MAX = 120;
const TEXT_MAX = 200;
const DECISION_ID_MAX = 64;
const OPTION_ID_MAX = 32;
const OPTION_LABEL_MAX = 40;
const NOTE_MAX = 200;
const MAX_OPTIONS = 5;
const METRIC_DELTA_ABS_MAX = 1_000_000;

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const BOT_ID_RE = /^[a-z][a-z0-9_-]*$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const FORBIDDEN_KEYS = new Set([
  "url",
  "uri",
  "href",
  "endpoint",
  "webhook",
  "callback",
  "recipient",
  "recipients",
  "to",
  "cc",
  "bcc",
  "email",
  "from",
  "method",
  "httpmethod",
  "http_method",
  "path",
  "httppath",
  "http_path",
  "shell",
  "command",
  "cmd",
  "exec",
  "argv",
  "filesystem",
  "file",
  "filepath",
  "filename",
  "database",
  "db",
  "sql",
  "query",
  "credential",
  "credentials",
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "privatekey",
]);

const COMPANY_RE =
  /sofrecom|orange[\s._-]*(business|internal|corp|gitlab)|gitlab[\s._-]*(orange|sofrecom|internal)|internal[\s._-]*gitlab|cloud\s*foundry|cloudfoundry|\bmercury\b|corporate\s+(account|gitlab|intranet|docs?)|company\s+(confidential|docs?|intranet)/i;
const URL_RE = /https?:\/\/|www\./i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const EMAIL_HEADER_RE = /\b(from|to|cc|bcc|subject|message-id)\s*:/i;
const CV_RE = /curriculum\s+vitae|\bcv\s+attachment\b|linkedin\.com\/in\//i;
const PEM_RE = /-----BEGIN [A-Z ]+PRIVATE KEY-----/;
const BEARER_RE = /bearer\s+[A-Za-z0-9._\-+/=]{8,}/i;

const COMMON_KEYS = ["tool", "schemaVersion", "idempotencyKey", "botId", "timestamp", "nonce", "summary"] as const;

export type OsParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type OsCommonFields = {
  schemaVersion: OsAdapterSchemaVersion;
  idempotencyKey: string;
  botId: string;
  timestamp: string;
  nonce: string;
  summary: string;
};

export type OsMetricDelta = {
  metric: OsArea;
  delta: number;
};

export type OsPublishDashboardEvent = OsCommonFields & {
  tool: "publish_dashboard_event";
  area: OsArea;
  status: OsEventStatus;
  title: string;
  impact?: string;
  nextAction?: string;
  decisionNeeded?: boolean;
  approvalNeeded?: boolean;
  metricDelta?: OsMetricDelta;
};

export type OsRequestUserAttention = OsCommonFields & {
  tool: "request_user_attention";
  reason: OsAttentionReason;
  urgency: OsAttentionUrgency;
};

export type OsApprovalOption = {
  id: string;
  label: string;
};

export type OsRequestApproval = OsCommonFields & {
  tool: "request_approval";
  decisionId: string;
  options: OsApprovalOption[];
  expiresAt?: string;
};

export type OsAcknowledgeDecision = OsCommonFields & {
  tool: "acknowledge_decision";
  decisionId: string;
  choice: string;
  note?: string;
};

export type OsAdapterRequest =
  | OsPublishDashboardEvent
  | OsRequestUserAttention
  | OsRequestApproval
  | OsAcknowledgeDecision;

export type OsMcpToolDefinition = {
  name: OsAdapterToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export function envFlagEnabled(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isOsAdapterEnabled(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  return envFlagEnabled(env[OS_ADAPTER_ENV_FLAG]);
}

export function isOsLivePushEnabled(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  return envFlagEnabled(env[OS_LIVE_PUSH_ENV_FLAG]);
}

export function osAdapterToolDefinitions(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): OsMcpToolDefinition[] {
  if (!isOsAdapterEnabled(env)) return [];
  return OS_ADAPTER_MCP_TOOLS;
}

export const OS_ADAPTER_MCP_TOOLS: OsMcpToolDefinition[] = [
  {
    name: "publish_dashboard_event",
    description:
      "Record a Personal OS dashboard event (store-only unless live push is separately enabled). Destination is server-configured. No URLs, recipients, or credentials.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "idempotencyKey", "botId", "timestamp", "nonce", "summary", "area", "status", "title"],
      properties: {
        schemaVersion: { type: "string", enum: [...OS_ADAPTER_SCHEMA_VERSIONS] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: IDEMPOTENCY_MAX },
        botId: { type: "string", minLength: 2, maxLength: BOT_ID_MAX },
        timestamp: { type: "string", description: "UTC ISO-8601 timestamp" },
        nonce: { type: "string", minLength: 8, maxLength: NONCE_MAX },
        summary: { type: "string", minLength: 1, maxLength: SUMMARY_MAX },
        area: { type: "string", enum: [...OS_AREAS] },
        status: { type: "string", enum: [...OS_EVENT_STATUSES] },
        title: { type: "string", minLength: 1, maxLength: TITLE_MAX },
        impact: { type: "string", maxLength: TEXT_MAX },
        nextAction: { type: "string", maxLength: TEXT_MAX },
        decisionNeeded: { type: "boolean" },
        approvalNeeded: { type: "boolean" },
        metricDelta: {
          type: "object",
          additionalProperties: false,
          required: ["metric", "delta"],
          properties: {
            metric: { type: "string", enum: [...OS_AREAS] },
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
        schemaVersion: { type: "string", enum: [...OS_ADAPTER_SCHEMA_VERSIONS] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: IDEMPOTENCY_MAX },
        botId: { type: "string", minLength: 2, maxLength: BOT_ID_MAX },
        timestamp: { type: "string" },
        nonce: { type: "string", minLength: 8, maxLength: NONCE_MAX },
        summary: { type: "string", minLength: 1, maxLength: SUMMARY_MAX },
        reason: { type: "string", enum: [...OS_ATTENTION_REASONS] },
        urgency: { type: "string", enum: [...OS_ATTENTION_URGENCIES] },
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
        schemaVersion: { type: "string", enum: [...OS_ADAPTER_SCHEMA_VERSIONS] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: IDEMPOTENCY_MAX },
        botId: { type: "string", minLength: 2, maxLength: BOT_ID_MAX },
        timestamp: { type: "string" },
        nonce: { type: "string", minLength: 8, maxLength: NONCE_MAX },
        summary: { type: "string", minLength: 1, maxLength: SUMMARY_MAX },
        decisionId: { type: "string", minLength: 2, maxLength: DECISION_ID_MAX },
        options: {
          type: "array",
          minItems: 1,
          maxItems: MAX_OPTIONS,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label"],
            properties: {
              id: { type: "string", minLength: 1, maxLength: OPTION_ID_MAX },
              label: { type: "string", minLength: 1, maxLength: OPTION_LABEL_MAX },
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
        schemaVersion: { type: "string", enum: [...OS_ADAPTER_SCHEMA_VERSIONS] },
        idempotencyKey: { type: "string", minLength: 8, maxLength: IDEMPOTENCY_MAX },
        botId: { type: "string", minLength: 2, maxLength: BOT_ID_MAX },
        timestamp: { type: "string" },
        nonce: { type: "string", minLength: 8, maxLength: NONCE_MAX },
        summary: { type: "string", minLength: 1, maxLength: SUMMARY_MAX },
        decisionId: { type: "string", minLength: 2, maxLength: DECISION_ID_MAX },
        choice: { type: "string", minLength: 1, maxLength: OPTION_ID_MAX },
        note: { type: "string", maxLength: NOTE_MAX },
      },
    },
  },
];

export function parseOsAdapterRequest(raw: unknown): OsParseResult<OsAdapterRequest> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "JSON object required" };
  }

  const record = raw as Record<string, unknown>;
  const forbidden = firstForbiddenKey(record);
  if (forbidden) {
    return { ok: false, error: `forbidden field: ${forbidden}` };
  }

  const tool = record.tool;
  if (typeof tool !== "string" || !isOsAdapterToolName(tool)) {
    return { ok: false, error: "tool must be one of the four OS adapter tools" };
  }

  const common = parseCommon(record);
  if (!common.ok) return common;

  const contentError = firstForbiddenContent(record);
  if (contentError) return { ok: false, error: contentError };

  switch (tool) {
    case "publish_dashboard_event":
      return parsePublish(record, common.value);
    case "request_user_attention":
      return parseAttention(record, common.value);
    case "request_approval":
      return parseApproval(record, common.value);
    case "acknowledge_decision":
      return parseAcknowledge(record, common.value);
    default: {
      const unexpected: never = tool;
      return { ok: false, error: `unknown tool: ${String(unexpected)}` };
    }
  }
}

export function isOsAdapterToolName(value: string): value is OsAdapterToolName {
  return (OS_ADAPTER_TOOLS as readonly string[]).includes(value);
}

export function isOsAllowlistedChoice(value: string): value is OsAllowlistedChoice {
  return (OS_ALLOWLISTED_CHOICES as readonly string[]).includes(value);
}

export function isOsAdapterSchemaVersion(value: string): value is OsAdapterSchemaVersion {
  return (OS_ADAPTER_SCHEMA_VERSIONS as readonly string[]).includes(value);
}

function parseCommon(record: Record<string, unknown>): OsParseResult<OsCommonFields> {
  const schemaVersion = parseSchemaVersion(record.schemaVersion);
  if (!schemaVersion.ok) return schemaVersion;

  const idempotencyKey = requiredToken(record.idempotencyKey, "idempotencyKey", 8, IDEMPOTENCY_MAX);
  if (typeof idempotencyKey === "object") return idempotencyKey;

  const botId = requiredString(record.botId, "botId", 2, BOT_ID_MAX);
  if (typeof botId === "object") return botId;
  if (!BOT_ID_RE.test(botId)) {
    return { ok: false, error: "botId must be a lowercase allowlist-safe id" };
  }

  const timestamp = requiredString(record.timestamp, "timestamp", 10, 40);
  if (typeof timestamp === "object") return timestamp;
  if (!ISO_UTC_RE.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    return { ok: false, error: "timestamp must be UTC ISO-8601" };
  }

  const nonce = requiredToken(record.nonce, "nonce", 8, NONCE_MAX);
  if (typeof nonce === "object") return nonce;

  const summary = requiredSanitized(record.summary, "summary", 1, SUMMARY_MAX);
  if (typeof summary === "object") return summary;

  return { ok: true, value: { schemaVersion: schemaVersion.value, idempotencyKey, botId, timestamp, nonce, summary } };
}

function parseSchemaVersion(value: unknown): OsParseResult<OsAdapterSchemaVersion> {
  if (typeof value !== "string" || !isOsAdapterSchemaVersion(value)) {
    return { ok: false, error: "unsupported_schema_version" };
  }
  return { ok: true, value };
}

function parsePublish(
  record: Record<string, unknown>,
  common: OsCommonFields,
): OsParseResult<OsPublishDashboardEvent> {
  const extra = unknownKeys(record, [
    ...COMMON_KEYS,
    "area",
    "status",
    "title",
    "impact",
    "nextAction",
    "decisionNeeded",
    "approvalNeeded",
    "metricDelta",
  ]);
  if (extra) return extra;

  const area = requiredEnum(record.area, "area", OS_AREAS);
  if (typeof area === "object") return area;
  const status = requiredEnum(record.status, "status", OS_EVENT_STATUSES);
  if (typeof status === "object") return status;
  const title = requiredSanitized(record.title, "title", 1, TITLE_MAX);
  if (typeof title === "object") return title;

  const impact = optionalSanitized(record.impact, "impact", TEXT_MAX);
  if (typeof impact === "object") return impact;
  const nextAction = optionalSanitized(record.nextAction, "nextAction", TEXT_MAX);
  if (typeof nextAction === "object") return nextAction;
  const decisionNeeded = optionalBoolean(record.decisionNeeded, "decisionNeeded");
  if (typeof decisionNeeded === "object") return decisionNeeded;
  const approvalNeeded = optionalBoolean(record.approvalNeeded, "approvalNeeded");
  if (typeof approvalNeeded === "object") return approvalNeeded;
  const metricDelta = optionalMetricDelta(record.metricDelta);
  if (metricDelta && "error" in metricDelta) return metricDelta;

  return {
    ok: true,
    value: {
      tool: "publish_dashboard_event",
      ...common,
      area,
      status,
      title,
      ...(impact ? { impact } : {}),
      ...(nextAction ? { nextAction } : {}),
      ...(decisionNeeded !== undefined ? { decisionNeeded } : {}),
      ...(approvalNeeded !== undefined ? { approvalNeeded } : {}),
      ...(metricDelta ? { metricDelta } : {}),
    },
  };
}

function parseAttention(
  record: Record<string, unknown>,
  common: OsCommonFields,
): OsParseResult<OsRequestUserAttention> {
  const extra = unknownKeys(record, [...COMMON_KEYS, "reason", "urgency"]);
  if (extra) return extra;
  const reason = requiredEnum(record.reason, "reason", OS_ATTENTION_REASONS);
  if (typeof reason === "object") return reason;
  const urgency = requiredEnum(record.urgency, "urgency", OS_ATTENTION_URGENCIES);
  if (typeof urgency === "object") return urgency;
  return { ok: true, value: { tool: "request_user_attention", ...common, reason, urgency } };
}

function parseApproval(
  record: Record<string, unknown>,
  common: OsCommonFields,
): OsParseResult<OsRequestApproval> {
  const extra = unknownKeys(record, [...COMMON_KEYS, "decisionId", "options", "expiresAt"]);
  if (extra) return extra;
  const decisionId = requiredToken(record.decisionId, "decisionId", 2, DECISION_ID_MAX);
  if (typeof decisionId === "object") return decisionId;
  const options = parseOptions(record.options);
  if (!options.ok) return options;
  const expiresAt = optionalIso(record.expiresAt, "expiresAt");
  if (typeof expiresAt === "object") return expiresAt;
  return {
    ok: true,
    value: {
      tool: "request_approval",
      ...common,
      decisionId,
      options: options.value,
      ...(expiresAt ? { expiresAt } : {}),
    },
  };
}

function parseAcknowledge(
  record: Record<string, unknown>,
  common: OsCommonFields,
): OsParseResult<OsAcknowledgeDecision> {
  const extra = unknownKeys(record, [...COMMON_KEYS, "decisionId", "choice", "note"]);
  if (extra) return extra;
  const decisionId = requiredToken(record.decisionId, "decisionId", 2, DECISION_ID_MAX);
  if (typeof decisionId === "object") return decisionId;
  const choice = requiredToken(record.choice, "choice", 1, OPTION_ID_MAX);
  if (typeof choice === "object") return choice;
  const note = optionalSanitized(record.note, "note", NOTE_MAX);
  if (typeof note === "object") return note;
  return {
    ok: true,
    value: {
      tool: "acknowledge_decision",
      ...common,
      decisionId,
      choice,
      ...(note ? { note } : {}),
    },
  };
}

function parseOptions(value: unknown): OsParseResult<OsApprovalOption[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: "options must be an array" };
  }
  if (value.length < 1 || value.length > MAX_OPTIONS) {
    return { ok: false, error: `options supports 1–${MAX_OPTIONS} items` };
  }
  const options: OsApprovalOption[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `options[${index}] must be an object` };
    }
    const record = item as Record<string, unknown>;
    const extra = unknownKeys(record, ["id", "label"], `options[${index}]`);
    if (extra) return extra;
    const id = requiredToken(record.id, `options[${index}].id`, 1, OPTION_ID_MAX);
    if (typeof id === "object") return id;
    const label = requiredSanitized(record.label, `options[${index}].label`, 1, OPTION_LABEL_MAX);
    if (typeof label === "object") return label;
    options.push({ id, label });
  }
  return { ok: true, value: options };
}

function optionalMetricDelta(value: unknown): OsMetricDelta | undefined | { ok: false; error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "metricDelta must be an object" };
  }
  const record = value as Record<string, unknown>;
  const extra = unknownKeys(record, ["metric", "delta"], "metricDelta");
  if (extra) return extra;
  const metric = requiredEnum(record.metric, "metricDelta.metric", OS_AREAS);
  if (typeof metric === "object") return metric;
  if (typeof record.delta !== "number" || !Number.isFinite(record.delta)) {
    return { ok: false, error: "metricDelta.delta must be a finite number" };
  }
  if (Math.abs(record.delta) > METRIC_DELTA_ABS_MAX) {
    return { ok: false, error: `metricDelta.delta must be between -${METRIC_DELTA_ABS_MAX} and ${METRIC_DELTA_ABS_MAX}` };
  }
  return { metric, delta: record.delta };
}

function firstForbiddenKey(value: unknown, path = ""): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      return path ? `${path}.${key}` : key;
    }
    const found = firstForbiddenKey(child, path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return null;
}

function firstForbiddenContent(value: unknown): string | null {
  if (typeof value === "string") {
    return forbiddenContentReason(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstForbiddenContent(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      const found = firstForbiddenContent(child);
      if (found) return found;
    }
  }
  return null;
}

function forbiddenContentReason(value: string): string | null {
  if (COMPANY_RE.test(value)) return "forbidden_company_content";
  if (URL_RE.test(value)) return "url_content_not_allowed";
  if (EMAIL_RE.test(value) || EMAIL_HEADER_RE.test(value)) return "email_content_not_allowed";
  if (CV_RE.test(value)) return "cv_content_not_allowed";
  if (PEM_RE.test(value) || BEARER_RE.test(value)) return "secret_content_not_allowed";
  return null;
}

function unknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  prefix = "",
): { ok: false; error: string } | null {
  const allow = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allow.has(key)) {
      const name = prefix ? `${prefix}.${key}` : key;
      return { ok: false, error: `unknown field: ${name}` };
    }
  }
  return null;
}

function requiredString(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  if (value.length < min || value.length > max) {
    return { ok: false, error: `${field} must be ${min}–${max} characters` };
  }
  return value;
}

function requiredToken(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string | { ok: false; error: string } {
  const raw = requiredString(value, field, min, max);
  if (typeof raw === "object") return raw;
  if (!TOKEN_RE.test(raw)) {
    return { ok: false, error: `${field} must be token-safe` };
  }
  return raw;
}

function requiredSanitized(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  const sanitized = sanitizeText(value);
  if (sanitized.length < min || sanitized.length > max) {
    return { ok: false, error: `${field} must be ${min}–${max} characters` };
  }
  const forbidden = forbiddenContentReason(sanitized);
  if (forbidden) return { ok: false, error: forbidden };
  return sanitized;
}

function optionalSanitized(
  value: unknown,
  field: string,
  max: number,
): string | undefined | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredSanitized(value, field, 1, max);
}

function optionalBoolean(
  value: unknown,
  field: string,
): boolean | undefined | { ok: false; error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    return { ok: false, error: `${field} must be a boolean` };
  }
  return value;
}

function optionalIso(
  value: unknown,
  field: string,
): string | undefined | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = requiredString(value, field, 10, 40);
  if (typeof raw === "object") return raw;
  if (!ISO_UTC_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
    return { ok: false, error: `${field} must be UTC ISO-8601` };
  }
  return raw;
}

function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | { ok: false; error: string } {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return { ok: false, error: `${field} must be one of ${allowed.join(", ")}` };
  }
  return value as T;
}

function sanitizeText(value: string): string {
  let cleaned = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    cleaned += code < 32 || code === 127 ? " " : ch;
  }
  return cleaned.replace(/\s+/g, " ").trim();
}
