import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { requirePersonalOsBot } from "./auth.ts";
import { resetRuntimeEnvCache } from "./env.ts";
import { json, readJson } from "./http.ts";
import type { BlobStore } from "./store.ts";
import {
  buildPersonalOsDashboard,
  ingestPersonalOsEvent,
  personalOsSeedAllowed,
  prunePersonalOsEvents,
  syntheticPersonalOsEvents,
} from "./personal-os.ts";
import { parsePersonalOsEvent, type PersonalOsEvent } from "../../shared/personal-os.ts";

function memoryStore(): BlobStore {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? (map.get(key) as T) : null) ?? null;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async listKeys() {
      return [...map.keys()];
    },
  };
}

function sample(overrides: Record<string, unknown> = {}): PersonalOsEvent {
  const parsed = parsePersonalOsEvent({
    eventId: "evt-1",
    sourceBot: "otel-scout",
    timestamp: "2026-09-13T09:00:00.000Z",
    area: "otel",
    status: "opportunity",
    title: "Qualified OTel contribution",
    impact: "Maintainer invited a docs PR.",
    sourceUrl: "https://example.com/otel",
    nextAction: "Open draft PR",
    nextRun: "2026-09-14T09:00:00.000Z",
    decisionNeeded: false,
    approvalNeeded: false,
    metricDelta: { otelOpportunities: 1, otelContributions: 1 },
    ...overrides,
  });
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

describe("personal OS bot auth", () => {
  afterEach(() => {
    delete process.env.PERSONAL_OS_BOT_TOKENS;
    delete process.env.PERSONAL_OS_TOKEN_OTEL_SCOUT;
    resetRuntimeEnvCache();
  });

  it("returns 503 when no bot tokens are configured", () => {
    resetRuntimeEnvCache();
    const result = requirePersonalOsBot(
      new Request("https://example.com/api/personal-os/events", {
        headers: { authorization: "Bearer anything" },
      }),
      "otel-scout",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error, "personal_os_tokens_unconfigured");
    }
  });

  it("accepts a per-bot token from JSON or PERSONAL_OS_TOKEN_<BOT>", () => {
    process.env.PERSONAL_OS_BOT_TOKENS = JSON.stringify({ "grand-master": "gm-token" });
    process.env.PERSONAL_OS_TOKEN_OTEL_SCOUT = "otel-token";
    resetRuntimeEnvCache();

    const ok = requirePersonalOsBot(
      new Request("https://example.com", { headers: { authorization: "Bearer otel-token" } }),
      "otel-scout",
    );
    assert.deepEqual(ok, { ok: true });

    const wrongBot = requirePersonalOsBot(
      new Request("https://example.com", { headers: { authorization: "Bearer otel-token" } }),
      "grand-master",
    );
    assert.equal(wrongBot.ok, false);
    if (!wrongBot.ok) assert.equal(wrongBot.status, 401);

    const gm = requirePersonalOsBot(
      new Request("https://example.com", { headers: { authorization: "Bearer gm-token" } }),
      "grand-master",
    );
    assert.deepEqual(gm, { ok: true });
  });
});

describe("ingest + aggregation", () => {
  it("is idempotent on eventId and does not duplicate KPIs", async () => {
    const store = memoryStore();
    const first = await ingestPersonalOsEvent(sample(), { store, now: new Date("2026-09-13T10:00:00.000Z") });
    const second = await ingestPersonalOsEvent(sample(), { store, now: new Date("2026-09-13T10:01:00.000Z") });
    assert.equal(first.ok, true);
    assert.equal(first.idempotent, false);
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);

    const dashboard = await buildPersonalOsDashboard({ store, now: new Date("2026-09-13T10:05:00.000Z") });
    assert.equal(dashboard.outcomes.otelOpportunities, 1);
    assert.equal(dashboard.outcomes.otelContributions, 1);
    assert.equal(dashboard.today.length, 1);
  });

  it("prunes events older than the retention TTL", async () => {
    const store = memoryStore();
    await store.setJSON("event:old", {
      ...sample({ eventId: "old", timestamp: "2026-01-01T00:00:00.000Z" }),
      ingestedAt: "2026-01-01T00:00:00.000Z",
    });
    await store.setJSON("index", ["old"]);

    const pruned = await prunePersonalOsEvents(store, new Date("2026-09-13T00:00:00.000Z"), 90);
    assert.equal(pruned, 1);

    await ingestPersonalOsEvent(sample({ eventId: "fresh", timestamp: "2026-09-12T00:00:00.000Z" }), {
      store,
      now: new Date("2026-09-13T00:00:00.000Z"),
      retentionDays: 90,
    });
    const dashboard = await buildPersonalOsDashboard({
      store,
      now: new Date("2026-09-13T00:00:00.000Z"),
      retentionDays: 90,
    });
    assert.equal(dashboard.today.some((item) => item.eventId === "old"), false);
    assert.equal(
      dashboard.bots.some((bot) => bot.sourceBot === "otel-scout" && bot.lastRun !== null),
      true,
    );
  });

  it("groups views and bot health without vanity activity counts", async () => {
    const store = memoryStore();
    const now = new Date("2026-09-13T12:00:00.000Z");
    const events = [
      sample({
        eventId: "opp",
        status: "opportunity",
        metricDelta: { otelOpportunities: 1 },
      }),
      sample({
        eventId: "approve",
        sourceBot: "jobs-scout",
        area: "jobs",
        status: "pending_approval",
        title: "Apply to strong fit?",
        approvalNeeded: true,
        metricDelta: { jobFits: 1 },
        sourceUrl: "https://example.com/jobs/1",
      }),
      sample({
        eventId: "decide",
        sourceBot: "cfp-scout",
        area: "cfp",
        status: "decision_needed",
        title: "Submit CFP draft",
        decisionNeeded: true,
        metricDelta: { cfpsDrafted: 1 },
      }),
      sample({
        eventId: "fail",
        sourceBot: "talks-coach",
        area: "talks",
        status: "failed",
        title: "Full run aborted",
        metricDelta: { talkFullRuns: 0, talkWeakSections: 1 },
      }),
      sample({
        eventId: "routine",
        sourceBot: "routines",
        area: "routines",
        status: "ok",
        title: "Morning stretch done",
        metricDelta: { personalOpsResolved: 1 },
      }),
    ];
    for (const event of events) {
      await ingestPersonalOsEvent(event, { store, now });
    }

    const dashboard = await buildPersonalOsDashboard({ store, now });
    assert.equal(dashboard.timezone, "Africa/Casablanca");
    assert.ok(dashboard.generatedAtLocal);
    assert.equal(dashboard.outcomes.jobFits, 1);
    assert.equal(dashboard.outcomes.cfpsDrafted, 1);
    assert.equal(dashboard.outcomes.personalOpsResolved, 1);
    assert.equal("eventCount" in dashboard.outcomes, false);
    assert.equal(dashboard.approvals.length, 1);
    assert.equal(dashboard.decisions.length, 1);
    assert.equal(dashboard.failures.length, 1);
    assert.equal(dashboard.routines.length, 1);
    const talks = dashboard.bots.find((bot) => bot.sourceBot === "talks-coach");
    assert.equal(talks?.error, true);
    assert.equal(talks?.pendingApprovals, 0);
    const jobs = dashboard.bots.find((bot) => bot.sourceBot === "jobs-scout");
    assert.equal(jobs?.pendingApprovals, 1);
    assert.equal(jobs?.sourceLinks[0], "https://example.com/jobs/1");
    assert.ok(jobs?.lastRunLocal);
  });
});

describe("rate limit + seed gate", () => {
  it("rate-limits a source after the hourly cap and skips the cap on idempotent replay", async () => {
    const store = memoryStore();
    const tokens = memoryStore();
    const now = new Date("2026-09-13T12:00:00.000Z");
    const first = await ingestPersonalOsEvent(sample({ eventId: "rl-1" }), {
      store,
      tokens,
      now,
      rateLimit: 1,
    });
    const second = await ingestPersonalOsEvent(sample({ eventId: "rl-2" }), {
      store,
      tokens,
      now,
      rateLimit: 1,
    });
    const replay = await ingestPersonalOsEvent(sample({ eventId: "rl-1" }), {
      store,
      tokens,
      now,
      rateLimit: 1,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.error, "rate_limited");
    assert.equal(replay.ok, true);
    assert.equal(replay.idempotent, true);
  });

  it("allows seed only when flagged and not in production", () => {
    assert.equal(personalOsSeedAllowed({ allowSeed: false, context: "dev", siteUrl: "" }), false);
    assert.equal(
      personalOsSeedAllowed({
        allowSeed: true,
        context: "production",
        siteUrl: "https://agent-notify.netlify.app",
      }),
      false,
    );
    assert.equal(
      personalOsSeedAllowed({
        allowSeed: true,
        context: "deploy-preview",
        siteUrl: "https://deploy-preview-9--agent-notify.netlify.app",
      }),
      true,
    );
  });

  it("labels synthetic fixtures as DEV-ONLY", () => {
    const events = syntheticPersonalOsEvents(new Date("2026-09-13T12:00:00.000Z"));
    assert.ok(events.length >= 6);
    for (const event of events) {
      assert.match(event.title, /\[DEV-ONLY\]/);
      const parsed = parsePersonalOsEvent(event);
      assert.equal("error" in parsed, false, "error" in parsed ? parsed.error : "");
    }
  });
});

describe("http helpers still encode JSON", () => {
  it("parses event bodies for the ingest handler shape", async () => {
    const req = new Request("https://example.com/api/personal-os/events", {
      method: "POST",
      body: JSON.stringify(sample()),
    });
    const body = await readJson(req);
    assert.equal(body.ok, true);
    const res = json({ ok: true }, 200);
    assert.equal(res.status, 200);
  });
});
