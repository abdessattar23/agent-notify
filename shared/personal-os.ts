export const PERSONAL_OS_TIMEZONE = "Africa/Casablanca";
export const PERSONAL_OS_RETENTION_DAYS_DEFAULT = 90;
export const PERSONAL_OS_STALE_HOURS_DEFAULT = 36;
export const PERSONAL_OS_MAX_EVENTS_DEFAULT = 500;

export const SOURCE_BOTS = [
  "grand-master",
  "otel-scout",
  "cfp-scout",
  "jobs-scout",
  "talks-coach",
  "eng-missions",
  "personal-ops",
  "routines",
] as const;

export const AREAS = [
  "otel",
  "cfp",
  "jobs",
  "talks",
  "engineering",
  "personal-ops",
  "routines",
  "decisions",
  "approvals",
] as const;

export const STATUSES = [
  "ok",
  "info",
  "stale",
  "error",
  "blocked",
  "pending_approval",
  "decision_needed",
  "deadline",
  "done",
  "failed",
  "opportunity",
] as const;

export const METRIC_KEYS = [
  "otelOpportunities",
  "otelContributions",
  "cfpsFound",
  "cfpsDrafted",
  "cfpsSubmitted",
  "cfpsAccepted",
  "jobFits",
  "jobApplications",
  "jobInterviews",
  "talkPractices",
  "talkFullRuns",
  "talkWeakSections",
  "engineeringMissions",
  "personalOpsResolved",
] as const;

export const EVENT_KEYS = [
  "eventId",
  "sourceBot",
  "timestamp",
  "area",
  "status",
  "title",
  "impact",
  "sourceUrl",
  "nextAction",
  "decisionNeeded",
  "approvalNeeded",
  "metricDelta",
  "nextRun",
  "deadline",
] as const;

export type SourceBot = (typeof SOURCE_BOTS)[number];
export type PersonalOsArea = (typeof AREAS)[number];
export type PersonalOsStatus = (typeof STATUSES)[number];
export type MetricKey = (typeof METRIC_KEYS)[number];

export type OutcomeKpis = Record<MetricKey, number>;

export type PersonalOsEvent = {
  eventId: string;
  sourceBot: SourceBot;
  timestamp: string;
  area: PersonalOsArea;
  status: PersonalOsStatus;
  title: string;
  impact?: string;
  sourceUrl?: string;
  nextAction?: string;
  decisionNeeded?: boolean;
  approvalNeeded?: boolean;
  metricDelta?: Partial<OutcomeKpis>;
  nextRun?: string;
  deadline?: string;
};

export type ParseResult = PersonalOsEvent | { error: string };
export type NotifyDecision = { notify: boolean; reason: string };

const SOURCE_BOT_SET = new Set<string>(SOURCE_BOTS);
const AREA_SET = new Set<string>(AREAS);
const STATUS_SET = new Set<string>(STATUSES);
const METRIC_KEY_SET = new Set<string>(METRIC_KEYS);
const EVENT_KEY_SET = new Set<string>(EVENT_KEYS);

const EVENT_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const TITLE_MAX = 160;
const IMPACT_MAX = 280;
const NEXT_ACTION_MAX = 200;
const URL_MAX = 500;
const METRIC_MIN = -10_000;
const METRIC_MAX = 10_000;

const FORBIDDEN_COMPANY =
  /\bsofrecom\b|\borange\s+(business|systems?|internal|gitlab|s\.?a\.?)\b|\bgitlab\.(orange|sofrecom|corp|internal)\b|\binternal\s+gitlab\b|\bcloud\s*foundry\b|\bcloudfoundry\b|\bmercury\b|\bcompany\s+documents?\b|\bcorporate\s+(wiki|data|systems?)\b/i;

const FORBIDDEN_SECRET =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]|\bbearer\s+[A-Za-z0-9._\-+=/]{16,}|\bpassword\s*[:=]/i;

const FORBIDDEN_EMAIL = /^(from|to|cc|bcc|subject|mime-version):/im;
const FORBIDDEN_CV = /\bcurriculum\s+vitae\b|\bcover\s+letter\b|\bmy\s+resume\b/i;

export function parsePersonalOsEvent(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "JSON object required" };
  }

  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!EVENT_KEY_SET.has(key)) {
      return { error: `unknown field: ${key}` };
    }
  }

  const eventId = requiredString(record.eventId, "eventId", 128);
  if (typeof eventId === "object") return eventId;
  if (!EVENT_ID_RE.test(eventId)) {
    return { error: "eventId must be 1-128 characters of [A-Za-z0-9._:-]" };
  }

  const sourceBot = requiredString(record.sourceBot, "sourceBot", 64);
  if (typeof sourceBot === "object") return sourceBot;
  if (!SOURCE_BOT_SET.has(sourceBot)) {
    return { error: "sourceBot is not allowlisted" };
  }

  const timestamp = requiredIso(record.timestamp, "timestamp");
  if (typeof timestamp === "object") return timestamp;

  const area = requiredString(record.area, "area", 64);
  if (typeof area === "object") return area;
  if (!AREA_SET.has(area)) {
    return { error: "area is not allowlisted" };
  }

  const status = requiredString(record.status, "status", 64);
  if (typeof status === "object") return status;
  if (!STATUS_SET.has(status)) {
    return { error: "status is not allowlisted" };
  }

  const title = requiredSanitizedString(record.title, "title", TITLE_MAX);
  if (typeof title === "object") return title;

  const impact = optionalSanitizedString(record.impact, "impact", IMPACT_MAX);
  if (typeof impact === "object") return impact;

  const nextAction = optionalSanitizedString(record.nextAction, "nextAction", NEXT_ACTION_MAX);
  if (typeof nextAction === "object") return nextAction;

  const sourceUrl = optionalSourceUrl(record.sourceUrl);
  if (typeof sourceUrl === "object") return sourceUrl;

  const decisionNeeded = optionalBoolean(record.decisionNeeded, "decisionNeeded");
  if (typeof decisionNeeded === "object") return decisionNeeded;

  const approvalNeeded = optionalBoolean(record.approvalNeeded, "approvalNeeded");
  if (typeof approvalNeeded === "object") return approvalNeeded;

  const metricDelta = optionalMetricDelta(record.metricDelta);
  if (metricDelta && "error" in metricDelta) return metricDelta;

  const nextRun = optionalIso(record.nextRun, "nextRun");
  if (typeof nextRun === "object") return nextRun;

  const deadline = optionalIso(record.deadline, "deadline");
  if (typeof deadline === "object") return deadline;

  return {
    eventId,
    sourceBot: sourceBot as SourceBot,
    timestamp,
    area: area as PersonalOsArea,
    status: status as PersonalOsStatus,
    title,
    ...(impact ? { impact } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(nextAction ? { nextAction } : {}),
    ...(decisionNeeded !== undefined ? { decisionNeeded } : {}),
    ...(approvalNeeded !== undefined ? { approvalNeeded } : {}),
    ...(metricDelta ? { metricDelta } : {}),
    ...(nextRun ? { nextRun } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

export function emptyOutcomeKpis(): OutcomeKpis {
  return {
    otelOpportunities: 0,
    otelContributions: 0,
    cfpsFound: 0,
    cfpsDrafted: 0,
    cfpsSubmitted: 0,
    cfpsAccepted: 0,
    jobFits: 0,
    jobApplications: 0,
    jobInterviews: 0,
    talkPractices: 0,
    talkFullRuns: 0,
    talkWeakSections: 0,
    engineeringMissions: 0,
    personalOpsResolved: 0,
  };
}

export function aggregateOutcomeKpis(events: PersonalOsEvent[]): OutcomeKpis {
  const kpis = emptyOutcomeKpis();
  for (const event of events) {
    const delta = event.metricDelta;
    if (!delta) continue;
    for (const key of METRIC_KEYS) {
      const value = delta[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        kpis[key] += value;
      }
    }
  }
  return kpis;
}

export function formatCasablanca(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PERSONAL_OS_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function casablancaDateKey(iso: string, now = iso): string {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PERSONAL_OS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isExpiredEvent(timestamp: string, now: Date, retentionDays: number): boolean {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return true;
  return now.getTime() - value > retentionDays * 86_400_000;
}

export function decidePersonalOsNotify(event: PersonalOsEvent, now = new Date()): NotifyDecision {
  if (event.approvalNeeded || event.status === "pending_approval") {
    return { notify: true, reason: "approval" };
  }
  if (event.status === "deadline" || isDeadlineSoon(event.deadline, now)) {
    return { notify: true, reason: "deadline" };
  }
  if (event.status === "failed" || event.status === "error") {
    return { notify: true, reason: "failure" };
  }
  if (event.status === "stale") {
    return { notify: true, reason: "stale" };
  }
  if (event.status === "opportunity") {
    return { notify: true, reason: "opportunity" };
  }
  return { notify: false, reason: "routine" };
}

export function isDeadlineSoon(deadline: string | undefined, now: Date, hours = 48): boolean {
  if (!deadline) return false;
  const value = Date.parse(deadline);
  if (!Number.isFinite(value)) return false;
  const delta = value - now.getTime();
  return delta <= hours * 3_600_000 && delta >= -hours * 3_600_000;
}

export function privacyViolation(text: string): string | null {
  if (FORBIDDEN_COMPANY.test(text)) {
    return "forbidden company or internal-systems content";
  }
  if (FORBIDDEN_SECRET.test(text)) {
    return "credentials or tokens are not allowed";
  }
  if (FORBIDDEN_EMAIL.test(text)) {
    return "email bodies are not allowed";
  }
  if (FORBIDDEN_CV.test(text)) {
    return "CV or private-file contents are not allowed";
  }
  return null;
}

function requiredString(
  value: unknown,
  field: string,
  max: number,
): string | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${field} is required` };
  }
  if (value.length > max) {
    return { error: `${field} must be ${max} characters or fewer` };
  }
  return value.trim();
}

function requiredSanitizedString(
  value: unknown,
  field: string,
  max: number,
): string | { error: string } {
  const raw = requiredString(value, field, max);
  if (typeof raw === "object") return raw;
  return sanitizeField(raw, field);
}

function optionalSanitizedString(
  value: unknown,
  field: string,
  max: number,
): string | undefined | { error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return { error: `${field} must be a string` };
  if (value.length > max) return { error: `${field} must be ${max} characters or fewer` };
  return sanitizeField(value.trim(), field);
}

function sanitizeField(value: string, field: string): string | { error: string } {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const violation = privacyViolation(collapsed);
  if (violation) {
    return { error: `${field}: ${violation}` };
  }
  return collapsed;
}

function requiredIso(value: unknown, field: string): string | { error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${field} is required` };
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return { error: `${field} must be an ISO-8601 timestamp` };
  }
  return new Date(parsed).toISOString();
}

function optionalIso(value: unknown, field: string): string | undefined | { error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredIso(value, field);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined | { error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") return { error: `${field} must be a boolean` };
  return value;
}

function optionalSourceUrl(value: unknown): string | undefined | { error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return { error: "sourceUrl must be a string" };
  if (value.length > URL_MAX) return { error: `sourceUrl must be ${URL_MAX} characters or fewer` };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "sourceUrl must be an https URL" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "sourceUrl must be an https URL" };
  }
  if (parsed.username || parsed.password) {
    return { error: "sourceUrl must not include credentials" };
  }
  const violation = privacyViolation(parsed.href);
  if (violation) return { error: `sourceUrl: ${violation}` };
  return parsed.href;
}

function optionalMetricDelta(
  value: unknown,
): Partial<OutcomeKpis> | undefined | { error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "metricDelta must be an object" };
  }
  const record = value as Record<string, unknown>;
  const delta: Partial<OutcomeKpis> = {};
  for (const key of Object.keys(record)) {
    if (!METRIC_KEY_SET.has(key)) {
      return { error: `metricDelta contains unknown field: ${key}` };
    }
    const amount = record[key];
    if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isInteger(amount)) {
      return { error: `metricDelta.${key} must be an integer` };
    }
    if (amount < METRIC_MIN || amount > METRIC_MAX) {
      return { error: `metricDelta.${key} is out of range` };
    }
    delta[key as MetricKey] = amount;
  }
  return Object.keys(delta).length > 0 ? delta : undefined;
}
