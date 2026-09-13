import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERSONAL_OS_TIMEZONE,
  aggregateOutcomeKpis,
  casablancaDateKey,
  decidePersonalOsNotify,
  emptyOutcomeKpis,
  formatCasablanca,
  isExpiredEvent,
  parsePersonalOsEvent,
} from "./personal-os.ts";

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-otel-1",
    sourceBot: "otel-scout",
    timestamp: "2026-09-13T09:00:00.000Z",
    area: "otel",
    status: "opportunity",
    title: "Qualified OTel talk slot",
    impact: "Conference wants a tracing workshop.",
    sourceUrl: "https://example.com/cfp/otel",
    nextAction: "Draft abstract",
    decisionNeeded: false,
    approvalNeeded: false,
    metricDelta: { otelOpportunities: 1 },
    ...overrides,
  };
}

describe("parsePersonalOsEvent", () => {
  it("accepts a minimal valid event and keeps allowlisted fields", () => {
    const parsed = parsePersonalOsEvent(validEvent());
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.eventId, "evt-otel-1");
    assert.equal(parsed.sourceBot, "otel-scout");
    assert.equal(parsed.area, "otel");
    assert.equal(parsed.metricDelta?.otelOpportunities, 1);
  });

  it("rejects unknown top-level fields", () => {
    const result = parsePersonalOsEvent({
      ...validEvent(),
      extra: "nope",
    });
    assert.deepEqual(result, { error: "unknown field: extra" });
  });

  it("rejects unknown metricDelta keys", () => {
    const result = parsePersonalOsEvent(
      validEvent({ metricDelta: { pageViews: 99, otelOpportunities: 1 } }),
    );
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.match(result.error, /metricDelta/);
  });

  it("rejects oversized titles and impact", () => {
    assert.equal("error" in parsePersonalOsEvent(validEvent({ title: "x".repeat(161) })), true);
    assert.equal("error" in parsePersonalOsEvent(validEvent({ impact: "y".repeat(281) })), true);
  });

  it("rejects sourceBots and areas outside the allowlist", () => {
    const bot = parsePersonalOsEvent(validEvent({ sourceBot: "scraped-grok-ui" }));
    assert.deepEqual(bot, { error: "sourceBot is not allowlisted" });
    const area = parsePersonalOsEvent(validEvent({ area: "sofrecom" }));
    assert.deepEqual(area, { error: "area is not allowlisted" });
  });

  it("rejects unknown status values", () => {
    const result = parsePersonalOsEvent(validEvent({ status: "heartbeat" }));
    assert.deepEqual(result, { error: "status is not allowlisted" });
  });

  it("rejects non-https or credentialed sourceUrl", () => {
    assert.equal(
      "error" in parsePersonalOsEvent(validEvent({ sourceUrl: "javascript:alert(1)" })),
      true,
    );
    assert.equal(
      "error" in parsePersonalOsEvent(validEvent({ sourceUrl: "https://user:pass@example.com/x" })),
      true,
    );
  });

  it("rejects Sofrecom, Orange systems, internal GitLab, Mercury, and Cloud Foundry", () => {
    const forbidden = [
      "Need access to Sofrecom VPN",
      "Orange Business internal ticket",
      "See internal GitLab issue 12",
      "Cloud Foundry space is down",
      "Mercury CF org credentials",
    ];
    for (const impact of forbidden) {
      const result = parsePersonalOsEvent(validEvent({ impact }));
      assert.equal("error" in result, true, impact);
      if (!("error" in result)) continue;
      assert.match(result.error, /forbidden|privacy|company/i, impact);
    }
  });

  it("rejects credentials, tokens, email bodies, and CV contents", () => {
    const forbidden = [
      { title: "token leak", impact: "Bearer abcdefghijklmnop.secret" },
      { title: "key", impact: "-----BEGIN PRIVATE KEY----- MIIE" },
      { title: "mail dump", impact: "From: a@b.com\nSubject: Offer\n\nHi" },
      { title: "cv", impact: "Curriculum vitae\nEducation: ..." },
      { title: "password", impact: "password=hunter2 stored in notes" },
    ];
    for (const fields of forbidden) {
      const result = parsePersonalOsEvent(validEvent(fields));
      assert.equal("error" in result, true, fields.impact);
    }
  });

  it("accepts a short sanitized personal summary", () => {
    const parsed = parsePersonalOsEvent(
      validEvent({
        title: "  Strong job fit  ",
        impact: "Staff frontend role, remote-friendly.",
        area: "jobs",
        sourceBot: "jobs-scout",
        metricDelta: { jobFits: 1 },
      }),
    );
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.title, "Strong job fit");
  });
});

describe("Casablanca timezone", () => {
  it("documents Africa/Casablanca and formats stored UTC instants", () => {
    assert.equal(PERSONAL_OS_TIMEZONE, "Africa/Casablanca");
    const formatted = formatCasablanca("2026-09-13T09:00:00.000Z");
    assert.match(formatted, /13/);
    assert.match(formatted, /Sep/i);
    assert.equal(casablancaDateKey("2026-09-13T09:00:00.000Z"), "2026-09-13");
  });
});

describe("retention", () => {
  it("expires events older than the TTL", () => {
    const now = new Date("2026-09-13T00:00:00.000Z");
    assert.equal(isExpiredEvent("2026-06-01T00:00:00.000Z", now, 90), true);
    assert.equal(isExpiredEvent("2026-09-01T00:00:00.000Z", now, 90), false);
  });
});

describe("outcome KPIs", () => {
  it("sums outcome deltas and ignores vanity event counts", () => {
    const events = [
      parsePersonalOsEvent(
        validEvent({
          eventId: "a",
          metricDelta: { otelOpportunities: 2, otelContributions: 1 },
        }),
      ),
      parsePersonalOsEvent(
        validEvent({
          eventId: "b",
          sourceBot: "cfp-scout",
          area: "cfp",
          metricDelta: { cfpsFound: 3, cfpsDrafted: 1, cfpsSubmitted: 1, cfpsAccepted: 0 },
        }),
      ),
      parsePersonalOsEvent(
        validEvent({
          eventId: "c",
          sourceBot: "jobs-scout",
          area: "jobs",
          metricDelta: { jobFits: 2, jobApplications: 1, jobInterviews: 0 },
        }),
      ),
    ];
    const parsed = events.map((event) => {
      assert.equal("error" in event, false);
      if ("error" in event) throw new Error(event.error);
      return event;
    });
    const kpis = aggregateOutcomeKpis(parsed);
    assert.equal(kpis.otelOpportunities, 2);
    assert.equal(kpis.otelContributions, 1);
    assert.equal(kpis.cfpsFound, 3);
    assert.equal(kpis.jobFits, 2);
    assert.equal("eventCount" in kpis, false);
    assert.deepEqual(emptyOutcomeKpis().talkPractices, 0);
  });
});

describe("notify decisions", () => {
  it("notifies only for approval, deadline, failure/stale, or high-value opportunity", () => {
    const approval = parsePersonalOsEvent(validEvent({ approvalNeeded: true, status: "pending_approval" }));
    const deadline = parsePersonalOsEvent(validEvent({ status: "deadline", deadline: "2026-09-14T10:00:00.000Z" }));
    const failed = parsePersonalOsEvent(validEvent({ status: "failed" }));
    const stale = parsePersonalOsEvent(validEvent({ status: "stale" }));
    const opportunity = parsePersonalOsEvent(validEvent({ status: "opportunity" }));
    const routine = parsePersonalOsEvent(
      validEvent({
        status: "ok",
        approvalNeeded: false,
        decisionNeeded: false,
        title: "Routine check-in",
        impact: "Heartbeat-equivalent summary only.",
        metricDelta: { personalOpsResolved: 0 },
      }),
    );

    for (const event of [approval, deadline, failed, stale, opportunity, routine]) {
      assert.equal("error" in event, false);
    }
    if (
      "error" in approval ||
      "error" in deadline ||
      "error" in failed ||
      "error" in stale ||
      "error" in opportunity ||
      "error" in routine
    ) {
      return;
    }

    assert.equal(decidePersonalOsNotify(approval).notify, true);
    assert.equal(decidePersonalOsNotify(deadline).notify, true);
    assert.equal(decidePersonalOsNotify(failed).notify, true);
    assert.equal(decidePersonalOsNotify(stale).notify, true);
    assert.equal(decidePersonalOsNotify(opportunity).notify, true);
    assert.equal(decidePersonalOsNotify(routine).notify, false);
    assert.equal(decidePersonalOsNotify(routine).reason, "routine");
  });
});
