import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionNavigatePath,
  buildDeclarativePayload,
  isGonePushStatus,
  parseNotifyBody,
  resolveDefaultAction,
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

  it("parses rich fields and caps actions at 3", () => {
    const parsed = parseNotifyBody({
      title: "Ready",
      body: "Review the box",
      image: "/shots/a.png",
      badge_count: 2,
      data: { agent: "deploy" },
      default_action: { type: "show_box", agent: "deploy", hint: "preview" },
      actions: [
        { type: "copy", title: "Copy", text: "secret-code" },
        { type: "link", title: "PR", url: "https://example.com/pr/1" },
        { type: "inbox", title: "Inbox" },
      ],
    });
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.badge_count, 2);
    assert.equal(parsed.actions?.length, 3);
    assert.equal(parsed.default_action?.type, "show_box");
  });

  it("rejects a fourth action", () => {
    const result = parseNotifyBody({
      title: "Too many",
      actions: [
        { type: "open_app", title: "App" },
        { type: "inbox", title: "Inbox" },
        { type: "copy", title: "Copy", text: "x" },
        { type: "link", title: "Link", url: "/" },
      ],
    });
    assert.deepEqual(result, { error: "actions supports at most 3 items" });
  });

  it("requires url for link actions", () => {
    const result = parseNotifyBody({
      title: "Bad",
      actions: [{ type: "link", title: "Open" }],
    });
    assert.equal("error" in result, true);
  });
});

describe("declarative payload", () => {
  it("uses the RFC 8030 magic and forbids silent push", () => {
    const payload = buildDeclarativePayload(
      { title: "Hello", body: "World", url: "/status", tag: "t1" },
      "https://notify.example",
      "inbox-1",
    );
    assert.equal(payload.web_push, 8030);
    assert.equal(payload.mutable, true);
    assert.equal(payload.notification.silent, false);
    assert.equal(
      payload.notification.navigate,
      "https://notify.example/go/link?url=%2Fstatus",
    );
    assert.equal(payload.notification.tag, "t1");
    assert.equal(payload.notification.data?.inboxId, "inbox-1");
  });

  it("adds action navigate URLs, image, and app_badge", () => {
    const payload = buildDeclarativePayload(
      {
        title: "Box ready",
        body: "Open computer preview",
        image: "/img.png",
        badge_count: 4,
        default_action: { type: "show_box", title: "Box", agent: "agent-1", hint: "look here" },
        actions: [
          { type: "copy", title: "Copy", text: "abc" },
          { type: "link", title: "Docs", url: "https://example.com/docs" },
        ],
      },
      "https://notify.example",
      "id-42",
    );
    assert.match(payload.notification.navigate, /\/go\/box\?/);
    assert.equal(payload.notification.image, "https://notify.example/img.png");
    assert.equal(payload.notification.app_badge, "4");
    assert.equal(payload.notification.actions?.length, 2);
    assert.equal(payload.notification.actions?.[0]?.action, "a0");
    assert.equal(
      payload.notification.actions?.[0]?.navigate,
      "https://notify.example/go/copy?text=abc",
    );
    assert.equal(
      payload.notification.actions?.[1]?.navigate,
      "https://notify.example/go/link?url=https%3A%2F%2Fexample.com%2Fdocs",
    );
  });

  it("defaults to inbox when no url or default_action", () => {
    const action = resolveDefaultAction({ title: "Hi" }, "abc");
    assert.deepEqual(action, { type: "inbox", title: "Inbox", id: "abc" });
    assert.equal(actionNavigatePath(action, "abc"), "/inbox/abc");
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
