import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_REPLAY_WINDOW_SEC,
  OS_ADAPTER_TOOLS,
  OS_ALLOWLISTED_CHOICES,
  OS_AREAS,
  isOsAdapterEnabled,
  isOsLivePushEnabled,
  osAdapterToolDefinitions,
  parseOsAdapterRequest,
} from "./os-adapter.ts";

const COMMON = {
  idempotencyKey: "idem-key-001",
  botId: "personal-ops",
  timestamp: "2026-09-13T12:00:00.000Z",
  nonce: "nonce-abc-001",
  summary: "CFP deadline in 48h",
};

describe("os adapter enable flags", () => {
  afterEach(() => {
    delete process.env.AGENT_NOTIFY_OS_ADAPTER;
    delete process.env.AGENT_NOTIFY_OS_LIVE_PUSH;
  });

  it("is disabled when the adapter flag is unset", () => {
    delete process.env.AGENT_NOTIFY_OS_ADAPTER;
    assert.equal(isOsAdapterEnabled(), false);
  });

  it("is disabled for falsey flag values", () => {
    for (const value of ["0", "false", "no", "off", ""]) {
      assert.equal(isOsAdapterEnabled({ AGENT_NOTIFY_OS_ADAPTER: value }), false, value);
    }
  });

  it("enables only for explicit truthy flag values", () => {
    for (const value of ["1", "true", "yes", "on", "TRUE"]) {
      assert.equal(isOsAdapterEnabled({ AGENT_NOTIFY_OS_ADAPTER: value }), true, value);
    }
  });

  it("keeps live Web Push off by default", () => {
    delete process.env.AGENT_NOTIFY_OS_LIVE_PUSH;
    assert.equal(isOsLivePushEnabled(), false);
    assert.equal(isOsLivePushEnabled({ AGENT_NOTIFY_OS_ADAPTER: "true" }), false);
  });
});

describe("os adapter tool catalog", () => {
  it("exposes exactly the four allowlisted tool names", () => {
    assert.deepEqual([...OS_ADAPTER_TOOLS], [
      "publish_dashboard_event",
      "request_user_attention",
      "request_approval",
      "acknowledge_decision",
    ]);
  });

  it("omits tools from the catalog when the adapter is disabled", () => {
    assert.deepEqual(osAdapterToolDefinitions({ AGENT_NOTIFY_OS_ADAPTER: undefined }), []);
  });

  it("lists exactly four tools when enabled, with no destination or credential fields", () => {
    const tools = osAdapterToolDefinitions({ AGENT_NOTIFY_OS_ADAPTER: "true" });
    assert.equal(tools.length, 4);
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [...OS_ADAPTER_TOOLS],
    );
    const encoded = JSON.stringify(tools);
    assert.doesNotMatch(encoded, /"url"|"recipient"|"httpMethod"|"path"|"shell"|"filesystem"|"database"|"credential"|"token"/);
  });
});

describe("parseOsAdapterRequest", () => {
  it("accepts a valid publish_dashboard_event", () => {
    const parsed = parseOsAdapterRequest({
      tool: "publish_dashboard_event",
      ...COMMON,
      area: "cfp",
      status: "warning",
      title: "CFP closing",
      impact: "one talk slot",
      nextAction: "submit abstract",
      decisionNeeded: false,
      approvalNeeded: false,
      metricDelta: { metric: "cfp", delta: 1 },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.tool, "publish_dashboard_event");
    if (parsed.value.tool !== "publish_dashboard_event") return;
    assert.equal(parsed.value.area, "cfp");
    assert.equal(parsed.value.metricDelta?.delta, 1);
  });

  it("accepts a valid request_user_attention", () => {
    const parsed = parseOsAdapterRequest({
      tool: "request_user_attention",
      ...COMMON,
      reason: "deadline",
      urgency: "high",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.tool, "request_user_attention");
  });

  it("accepts a valid request_approval", () => {
    const parsed = parseOsAdapterRequest({
      tool: "request_approval",
      ...COMMON,
      decisionId: "dec-cfp-1",
      options: [
        { id: "submit", label: "Submit" },
        { id: "skip", label: "Skip" },
      ],
      expiresAt: "2026-09-14T12:00:00.000Z",
    });
    assert.equal(parsed.ok, true);
  });

  it("accepts a valid acknowledge_decision with an allowlisted choice", () => {
    const parsed = parseOsAdapterRequest({
      tool: "acknowledge_decision",
      ...COMMON,
      decisionId: "dec-cfp-1",
      choice: "approve",
      note: "ship it",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.ok(OS_ALLOWLISTED_CHOICES.includes("approve"));
  });

  it("rejects unknown fields", () => {
    const parsed = parseOsAdapterRequest({
      tool: "request_user_attention",
      ...COMMON,
      reason: "deadline",
      urgency: "low",
      extra: "nope",
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.error, /unknown field/i);
  });

  it("rejects unknown enums and overlong strings", () => {
    const badStatus = parseOsAdapterRequest({
      tool: "publish_dashboard_event",
      ...COMMON,
      area: "cfp",
      status: "sparkles",
      title: "x",
    });
    assert.equal(badStatus.ok, false);

    const overlong = parseOsAdapterRequest({
      tool: "publish_dashboard_event",
      ...COMMON,
      summary: "s".repeat(201),
      area: "jobs",
      status: "info",
      title: "t",
    });
    assert.equal(overlong.ok, false);

    const vanity = parseOsAdapterRequest({
      tool: "publish_dashboard_event",
      ...COMMON,
      area: "otel",
      status: "info",
      title: "views",
      metricDelta: { metric: "impressions", delta: 99 },
    });
    assert.equal(vanity.ok, false);
  });

  it("rejects arbitrary URL, recipient, HTTP, shell, filesystem, database, and credential fields", () => {
    const forbidden = [
      "url",
      "recipient",
      "httpMethod",
      "path",
      "shell",
      "command",
      "filesystem",
      "database",
      "credential",
      "token",
      "apiKey",
    ];
    for (const field of forbidden) {
      const parsed = parseOsAdapterRequest({
        tool: "request_user_attention",
        ...COMMON,
        reason: "other",
        urgency: "normal",
        [field]: "https://evil.example/hook",
      });
      assert.equal(parsed.ok, false, field);
    }
  });

  it("rejects company, Orange/Sofrecom, GitLab, Mercury, Cloud Foundry, email, and CV-like content", () => {
    const payloads = [
      "Sofrecom production outage",
      "Orange Business internal GitLab ticket",
      "sync internal gitlab runner",
      "Mercury treasury login",
      "Cloud Foundry org space",
      "email body From: boss@orange.com",
      "attached curriculum vitae",
    ];
    for (const summary of payloads) {
      const parsed = parseOsAdapterRequest({
        tool: "request_user_attention",
        ...COMMON,
        summary,
        reason: "other",
        urgency: "low",
      });
      assert.equal(parsed.ok, false, summary);
    }
  });

  it("rejects URL-like summaries even without a url field", () => {
    const parsed = parseOsAdapterRequest({
      tool: "request_user_attention",
      ...COMMON,
      summary: "open https://example.com/secret",
      reason: "other",
      urgency: "low",
    });
    assert.equal(parsed.ok, false);
  });

  it("requires common replay fields and a UTC ISO-8601 timestamp", () => {
    const missing = parseOsAdapterRequest({
      tool: "request_user_attention",
      botId: "personal-ops",
      summary: "hello",
      reason: "stale",
      urgency: "normal",
    });
    assert.equal(missing.ok, false);

    const badTs = parseOsAdapterRequest({
      tool: "request_user_attention",
      ...COMMON,
      timestamp: "yesterday",
      reason: "stale",
      urgency: "normal",
    });
    assert.equal(badTs.ok, false);
  });

  it("documents the default replay window as 300 seconds", () => {
    assert.equal(DEFAULT_REPLAY_WINDOW_SEC, 300);
  });

  it("only allows outcome KPI areas", () => {
    assert.deepEqual([...OS_AREAS], ["otel", "cfp", "jobs", "talks", "missions", "personal-ops"]);
  });
});
