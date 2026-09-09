import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeclarativePayload } from "./notify.ts";
import {
  buildShowNotification,
  coercePushPayload,
  openTargetWithClients,
  resolveClickTarget,
  sameClientUrl,
} from "./sw-push.ts";

describe("coercePushPayload", () => {
  it("returns an empty object for missing, invalid, or non-object data", () => {
    assert.deepEqual(coercePushPayload(null), {});
    assert.deepEqual(coercePushPayload("not-json"), {});
    assert.deepEqual(coercePushPayload([]), {});
  });

  it("parses a JSON string and passes objects through", () => {
    assert.deepEqual(coercePushPayload('{"title":"Hi"}'), { title: "Hi" });
    assert.deepEqual(coercePushPayload({ title: "Hi" }), { title: "Hi" });
  });
});

describe("buildShowNotification", () => {
  it("reads a Declarative Web Push envelope the same way iOS does", () => {
    const payload = buildDeclarativePayload(
      {
        title: "Deploy ready",
        body: "Preview is up",
        default_action: { type: "show_box", title: "Box" },
        actions: [
          { type: "copy", title: "Copy", text: "https://preview.example" },
          { type: "link", title: "Open PR", url: "https://github.com/example/pr/1" },
        ],
      },
      "https://agent-notify.example",
      "inbox-1",
    );

    const shown = buildShowNotification(payload);
    assert.equal(shown.title, "Deploy ready");
    assert.equal(shown.options.body, "Preview is up");
    assert.equal(shown.options.silent, false);
    assert.equal(shown.options.data.inboxId, "inbox-1");
    assert.match(shown.options.data.url, /\/go\/box/);
    assert.equal(shown.options.actions.length, 2);
    assert.equal(shown.options.actions[0]?.title, "Copy");
    assert.match(shown.options.data.actions.a0 ?? "", /\/go\/copy/);
    assert.match(shown.options.data.actions.a1 ?? "", /\/go\/link/);
  });

  it("accepts a flat Chromium-style payload without a notification wrapper", () => {
    const shown = buildShowNotification({
      title: "Ping",
      body: "Hello",
      navigate: "/inbox/abc",
    });
    assert.equal(shown.title, "Ping");
    assert.equal(shown.options.data.url, "/inbox/abc");
    assert.equal(shown.options.actions.length, 0);
  });

  it("falls back to Agent Notify instead of throwing on empty push", () => {
    const shown = buildShowNotification({});
    assert.equal(shown.title, "Agent Notify");
    assert.equal(shown.options.data.url, "/");
    assert.equal(shown.options.silent, false);
  });
});

describe("resolveClickTarget", () => {
  it("uses the action map for Chromium action buttons and the default url otherwise", () => {
    const data = {
      url: "/inbox/1",
      actions: { a0: "/go/copy?text=hi", a1: "/go/link?url=https%3A%2F%2Fexample.com" },
    };
    assert.equal(resolveClickTarget("a1", data), "/go/link?url=https%3A%2F%2Fexample.com");
    assert.equal(resolveClickTarget("", data), "/inbox/1");
    assert.equal(resolveClickTarget(undefined, data), "/inbox/1");
    assert.equal(resolveClickTarget("missing", data), "/inbox/1");
  });
});

describe("sameClientUrl", () => {
  it("treats trailing slashes as the same window", () => {
    assert.equal(
      sameClientUrl("https://app.example/go/box", "https://app.example/go/box/"),
      true,
    );
    assert.equal(
      sameClientUrl("https://app.example/inbox/1", "https://app.example/inbox/2"),
      false,
    );
  });
});

describe("openTargetWithClients", () => {
  it("focuses an existing window already on the target", async () => {
    const calls: string[] = [];
    await openTargetWithClients("https://app.example/inbox/1", "https://app.example/", {
      matchAll: async () => [
        {
          url: "https://app.example/inbox/1",
          focus: async () => {
            calls.push("focus");
          },
          navigate: async () => {
            calls.push("navigate");
          },
        },
      ],
      openWindow: async () => {
        calls.push("open");
      },
    });
    assert.deepEqual(calls, ["focus"]);
  });

  it("falls back to openWindow when Chromium navigate rejects", async () => {
    const calls: string[] = [];
    await openTargetWithClients("/go/box", "https://app.example/", {
      matchAll: async () => [
        {
          url: "https://app.example/",
          focus: async () => {
            calls.push("focus");
          },
          navigate: async () => {
            calls.push("navigate");
            throw new Error("navigate not supported");
          },
        },
      ],
      openWindow: async (url) => {
        calls.push(`open:${url}`);
      },
    });
    assert.deepEqual(calls, ["navigate", "open:https://app.example/go/box"]);
  });

  it("opens a window when no clients exist", async () => {
    const calls: string[] = [];
    await openTargetWithClients("/inbox/9", "https://app.example", {
      matchAll: async () => [],
      openWindow: async (url) => {
        calls.push(url);
      },
    });
    assert.deepEqual(calls, ["https://app.example/inbox/9"]);
  });
});
