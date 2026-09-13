import {
  PERSONAL_OS_MAX_EVENTS_DEFAULT,
  PERSONAL_OS_STALE_HOURS_DEFAULT,
  PERSONAL_OS_TIMEZONE,
  SOURCE_BOTS,
  aggregateOutcomeKpis,
  casablancaDateKey,
  decidePersonalOsNotify,
  formatCasablanca,
  isExpiredEvent,
  type OutcomeKpis,
  type PersonalOsEvent,
  type SourceBot,
} from "../../shared/personal-os.ts";
import { getRuntimeEnv } from "./env.ts";
import { consumeNamedRateLimit, type RateLimitDecision } from "./rate-limit.ts";
import {
  isCanonicalProductionHost,
  isDraftPreviewHost,
  personalOsStore,
  type BlobStore,
} from "./store.ts";

const INDEX_KEY = "index";
const EVENT_PREFIX = "event:";

export type StoredPersonalOsEvent = PersonalOsEvent & {
  ingestedAt: string;
  sample?: boolean;
};

export type IngestOk = {
  ok: true;
  eventId: string;
  idempotent: boolean;
  notify?: { notify: boolean; reason: string };
};

export type IngestErr = {
  ok: false;
  error: string;
  status: number;
  retryAfter?: number;
};

export type IngestResult = IngestOk | IngestErr;

export type IngestOptions = {
  store?: BlobStore;
  tokens?: BlobStore;
  now?: Date;
  retentionDays?: number;
  rateLimit?: number;
  maxEvents?: number;
};

export type DashboardBot = {
  sourceBot: SourceBot;
  lastRun: string | null;
  nextRun: string | null;
  lastRunLocal: string | null;
  nextRunLocal: string | null;
  stale: boolean;
  error: boolean;
  blockers: number;
  pendingApprovals: number;
  sourceLinks: string[];
};

export type DashboardEvent = PersonalOsEvent & {
  timestampLocal: string;
  deadlineLocal?: string;
  nextRunLocal?: string;
  sample?: boolean;
};

export type PersonalOsDashboard = {
  ok: true;
  timezone: typeof PERSONAL_OS_TIMEZONE;
  generatedAt: string;
  generatedAtLocal: string;
  sampleDataPresent: boolean;
  seedAllowed: boolean;
  notifyEnabled: boolean;
  today: DashboardEvent[];
  outcomes: OutcomeKpis;
  bots: DashboardBot[];
  routines: DashboardEvent[];
  decisions: DashboardEvent[];
  approvals: DashboardEvent[];
  failures: DashboardEvent[];
};

export type SeedGate = {
  allowSeed: boolean;
  context?: string;
  siteUrl?: string;
  requestUrl?: string;
  deployUrl?: string;
  deployPrimeUrl?: string;
};

export async function ingestPersonalOsEvent(
  event: PersonalOsEvent,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const store = options.store ?? personalOsStore();
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? 90;
  const existing = await store.getJSON<StoredPersonalOsEvent>(eventKey(event.eventId));
  if (existing?.eventId === event.eventId) {
    return { ok: true, eventId: event.eventId, idempotent: true };
  }

  if (options.rateLimit !== undefined) {
    const tokens = options.tokens ?? store;
    const limit = await consumeNamedRateLimit(
      `personal-os:${event.sourceBot}`,
      options.rateLimit,
      now,
      tokens,
    );
    if (!limit.ok) {
      return rateLimited(limit);
    }
  }

  await prunePersonalOsEvents(store, now, retentionDays, options.maxEvents);
  const stored: StoredPersonalOsEvent = {
    ...event,
    ingestedAt: now.toISOString(),
  };
  await store.setJSON(eventKey(event.eventId), stored);
  const index = (await store.getJSON<string[]>(INDEX_KEY)) ?? [];
  const next = [event.eventId, ...index.filter((id) => id !== event.eventId)];
  await store.setJSON(INDEX_KEY, next);
  return {
    ok: true,
    eventId: event.eventId,
    idempotent: false,
    notify: decidePersonalOsNotify(event, now),
  };
}

export async function prunePersonalOsEvents(
  store: BlobStore,
  now: Date,
  retentionDays: number,
  maxEvents = PERSONAL_OS_MAX_EVENTS_DEFAULT,
): Promise<number> {
  const index = (await store.getJSON<string[]>(INDEX_KEY)) ?? [];
  const kept: string[] = [];
  let pruned = 0;
  for (const id of index) {
    const event = await store.getJSON<StoredPersonalOsEvent>(eventKey(id));
    if (!event || isExpiredEvent(event.timestamp, now, retentionDays)) {
      await store.delete(eventKey(id));
      pruned += 1;
      continue;
    }
    kept.push(id);
  }
  const overflow = kept.slice(maxEvents);
  for (const id of overflow) {
    await store.delete(eventKey(id));
    pruned += 1;
  }
  const next = kept.slice(0, maxEvents);
  await store.setJSON(INDEX_KEY, next);
  return pruned;
}

export async function listPersonalOsEvents(
  store: BlobStore,
  now: Date,
  retentionDays: number,
): Promise<StoredPersonalOsEvent[]> {
  await prunePersonalOsEvents(store, now, retentionDays);
  const index = (await store.getJSON<string[]>(INDEX_KEY)) ?? [];
  const events: StoredPersonalOsEvent[] = [];
  for (const id of index) {
    const event = await store.getJSON<StoredPersonalOsEvent>(eventKey(id));
    if (event?.eventId) events.push(event);
  }
  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return events;
}

export async function buildPersonalOsDashboard(options: {
  store?: BlobStore;
  now?: Date;
  retentionDays?: number;
  seedAllowed?: boolean;
  notifyEnabled?: boolean;
  staleHours?: number;
}): Promise<PersonalOsDashboard> {
  const store = options.store ?? personalOsStore();
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? 90;
  const events = await listPersonalOsEvents(store, now, retentionDays);
  const todayKey = casablancaDateKey(now.toISOString());
  const display = events.map(toDashboardEvent);
  const today = display.filter((event) => casablancaDateKey(event.timestamp) === todayKey);
  const bots = SOURCE_BOTS.map((sourceBot) =>
    summarizeBot(
      sourceBot,
      events.filter((event) => event.sourceBot === sourceBot),
      now,
      options.staleHours ?? PERSONAL_OS_STALE_HOURS_DEFAULT,
    ),
  );

  return {
    ok: true,
    timezone: PERSONAL_OS_TIMEZONE,
    generatedAt: now.toISOString(),
    generatedAtLocal: formatCasablanca(now.toISOString()),
    sampleDataPresent: events.some((event) => event.sample || event.title.startsWith("[DEV-ONLY]")),
    seedAllowed: options.seedAllowed ?? false,
    notifyEnabled: options.notifyEnabled ?? false,
    today,
    outcomes: aggregateOutcomeKpis(events),
    bots,
    routines: display.filter((event) => event.area === "routines"),
    decisions: display.filter(
      (event) => event.decisionNeeded || event.status === "decision_needed" || event.area === "decisions",
    ),
    approvals: display.filter(
      (event) => event.approvalNeeded || event.status === "pending_approval" || event.area === "approvals",
    ),
    failures: display.filter(
      (event) => event.status === "failed" || event.status === "error" || event.status === "stale",
    ),
  };
}

export function personalOsSeedAllowed(gate: SeedGate): boolean {
  if (!gate.allowSeed) return false;
  if (isCanonicalProductionHost(gate.requestUrl)) return false;
  const identity = personalOsIdentityUrl(gate);
  if (isCanonicalProductionHost(identity)) return false;
  return true;
}

export function personalOsStoreForRequest(req: Request, deployPublished?: boolean): BlobStore {
  const env = getRuntimeEnv();
  return personalOsStore({
    requestUrl: req.url,
    deployUrl: env.deployUrl,
    deployPrimeUrl: env.deployPrimeUrl,
    siteUrl: env.siteUrl,
    deployPublished,
  });
}

export function personalOsSeedAllowedForRequest(req: Request): boolean {
  const env = getRuntimeEnv();
  return personalOsSeedAllowed({
    allowSeed: env.personalOsAllowSeed,
    context: env.deployContext,
    siteUrl: env.siteUrl,
    requestUrl: req.url,
    deployUrl: env.deployUrl,
    deployPrimeUrl: env.deployPrimeUrl,
  });
}

function personalOsIdentityUrl(gate: SeedGate): string {
  if (isDraftPreviewHost(gate.requestUrl) || isCanonicalProductionHost(gate.requestUrl)) {
    return gate.requestUrl ?? "";
  }
  if (isDraftPreviewHost(gate.deployUrl)) return gate.deployUrl ?? "";
  if (isDraftPreviewHost(gate.deployPrimeUrl)) return gate.deployPrimeUrl ?? "";
  if (gate.requestUrl) return gate.requestUrl;
  return gate.deployUrl || gate.deployPrimeUrl || gate.siteUrl || "";
}

export function syntheticPersonalOsEvents(now = new Date()): PersonalOsEvent[] {
  const timestamp = now.toISOString();
  const nextRun = new Date(now.getTime() + 24 * 3_600_000).toISOString();
  const deadline = new Date(now.getTime() + 12 * 3_600_000).toISOString();
  return [
    {
      eventId: "dev-only-otel-1",
      sourceBot: "otel-scout",
      timestamp,
      area: "otel",
      status: "opportunity",
      title: "[DEV-ONLY] Qualified OTel workshop slot",
      impact: "Community CFP wants a tracing workshop abstract.",
      sourceUrl: "https://example.com/dev-only/otel",
      nextAction: "Draft abstract",
      nextRun,
      metricDelta: { otelOpportunities: 1 },
    },
    {
      eventId: "dev-only-cfp-1",
      sourceBot: "cfp-scout",
      timestamp,
      area: "cfp",
      status: "decision_needed",
      title: "[DEV-ONLY] CFP draft ready for review",
      impact: "Drafted a 45-minute observability talk.",
      sourceUrl: "https://example.com/dev-only/cfp",
      nextAction: "Decide whether to submit",
      decisionNeeded: true,
      metricDelta: { cfpsFound: 1, cfpsDrafted: 1 },
    },
    {
      eventId: "dev-only-jobs-1",
      sourceBot: "jobs-scout",
      timestamp,
      area: "jobs",
      status: "pending_approval",
      title: "[DEV-ONLY] Strong staff-level fit",
      impact: "Remote frontend role matches stated constraints.",
      sourceUrl: "https://example.com/dev-only/job",
      nextAction: "Approve tailored application",
      approvalNeeded: true,
      metricDelta: { jobFits: 1 },
    },
    {
      eventId: "dev-only-talks-1",
      sourceBot: "talks-coach",
      timestamp,
      area: "talks",
      status: "failed",
      title: "[DEV-ONLY] Full run stopped at weak section",
      impact: "Section 3 overrun; needs a tighter demo.",
      nextAction: "Rehearse section 3 only",
      metricDelta: { talkPractices: 1, talkWeakSections: 1 },
    },
    {
      eventId: "dev-only-eng-1",
      sourceBot: "eng-missions",
      timestamp,
      area: "engineering",
      status: "ok",
      title: "[DEV-ONLY] Personal engineering mission closed",
      impact: "Finished the local notify dashboard slice.",
      metricDelta: { engineeringMissions: 1 },
    },
    {
      eventId: "dev-only-ops-1",
      sourceBot: "personal-ops",
      timestamp,
      area: "personal-ops",
      status: "deadline",
      title: "[DEV-ONLY] Renew domain before cutoff",
      impact: "Personal domain reminder — no company systems.",
      nextAction: "Pay renewal",
      deadline,
      metricDelta: { personalOpsResolved: 0 },
    },
    {
      eventId: "dev-only-routines-1",
      sourceBot: "routines",
      timestamp,
      area: "routines",
      status: "ok",
      title: "[DEV-ONLY] Morning planning complete",
      impact: "Prioritized one talk, one job fit, one OTel note.",
      nextRun,
    },
    {
      eventId: "dev-only-gm-1",
      sourceBot: "grand-master",
      timestamp,
      area: "personal-ops",
      status: "stale",
      title: "[DEV-ONLY] Ledger publisher unheard from",
      impact: "No sanitized ledger batch in the stale window.",
      nextAction: "Wait for Grand Master Bot publish",
      nextRun,
    },
  ];
}

export async function seedSyntheticPersonalOsEvents(options: IngestOptions = {}): Promise<number> {
  const now = options.now ?? new Date();
  let stored = 0;
  for (const event of syntheticPersonalOsEvents(now)) {
    const result = await ingestPersonalOsEvent(event, { ...options, now });
    if (result.ok && !result.idempotent) {
      const store = options.store ?? personalOsStore();
      const existing = await store.getJSON<StoredPersonalOsEvent>(eventKey(event.eventId));
      if (existing) {
        await store.setJSON(eventKey(event.eventId), { ...existing, sample: true });
      }
      stored += 1;
    }
  }
  return stored;
}

function toDashboardEvent(event: StoredPersonalOsEvent): DashboardEvent {
  return {
    ...event,
    timestampLocal: formatCasablanca(event.timestamp),
    ...(event.deadline ? { deadlineLocal: formatCasablanca(event.deadline) } : {}),
    ...(event.nextRun ? { nextRunLocal: formatCasablanca(event.nextRun) } : {}),
  };
}

function summarizeBot(
  sourceBot: SourceBot,
  events: StoredPersonalOsEvent[],
  now: Date,
  staleHours: number,
): DashboardBot {
  const latest = events[0] ?? null;
  const lastRun = latest?.timestamp ?? null;
  const nextRun = events.find((event) => event.nextRun)?.nextRun ?? null;
  const staleByAge =
    !lastRun || now.getTime() - Date.parse(lastRun) > staleHours * 3_600_000;
  const stale = staleByAge || latest?.status === "stale";
  const error = latest?.status === "error" || latest?.status === "failed";
  const sourceLinks = unique(
    events.map((event) => event.sourceUrl).filter((url): url is string => Boolean(url)),
  ).slice(0, 5);

  return {
    sourceBot,
    lastRun,
    nextRun,
    lastRunLocal: lastRun ? formatCasablanca(lastRun) : null,
    nextRunLocal: nextRun ? formatCasablanca(nextRun) : null,
    stale,
    error,
    blockers: events.filter((event) => event.status === "blocked").length,
    pendingApprovals: events.filter(
      (event) => event.approvalNeeded || event.status === "pending_approval",
    ).length,
    sourceLinks,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function eventKey(eventId: string): string {
  return `${EVENT_PREFIX}${eventId}`;
}

function rateLimited(limit: RateLimitDecision): IngestErr {
  return {
    ok: false,
    error: "rate_limited",
    status: 429,
    retryAfter: limit.resetEpochSec,
  };
}
