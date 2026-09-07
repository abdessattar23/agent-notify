import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeclarativePayload,
  isGonePushStatus,
  parseNotifyBody,
  resolveNavigateUrl,
} from "./notify.ts";

describe("parseNotifyBody", () => {
  it("requires a title", () => {
    const result = parseNotifyBody({ body: "hi" });
    assert.deepEqual(result, { error: "title is required" });
  });

  it("accepts a minimal payload", () => {
    assert.deepEqual(parseNotifyBody({ title: " Build done " }), {
      title: "Build done",
    });
  });

  it("rejects overlong titles", () => {
    const result = parseNotifyBody({ title: "x".repeat(121) });
    assert.equal("error" in result, true);
  });
});

describe("declarative payload", () => {
  it("uses the RFC 8030 magic and forbids silent push", () => {
    const payload = buildDeclarativePayload(
      { title: "Hello", body: "World", url: "/inbox", tag: "t1" },
      "https://notify.example",
    );
    assert.equal(payload.web_push, 8030);
    assert.equal(payload.mutable, true);
    assert.equal(payload.notification.silent, false);
    assert.equal(payload.notification.navigate, "https://notify.example/inbox");
    assert.equal(payload.notification.tag, "t1");
  });

  it("resolves relative and absolute URLs", () => {
    assert.equal(
      resolveNavigateUrl("/status", "https://app.example"),
      "https://app.example/status",
    );
    assert.equal(
      resolveNavigateUrl("https://other.example/x", "https://app.example"),
      "https://other.example/x",
    );
  });

  it("prunes only dead subscription statuses", () => {
    assert.equal(isGonePushStatus(404), true);
    assert.equal(isGonePushStatus(410), true);
    assert.equal(isGonePushStatus(429), false);
  });
});
