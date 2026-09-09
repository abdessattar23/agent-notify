import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectClientPlatform,
  installRequired,
  notificationsHint,
  statusHint,
} from "./platform.ts";

describe("detectClientPlatform", () => {
  it("detects iPhone Safari", () => {
    assert.equal(
      detectClientPlatform({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      }),
      "ios",
    );
  });

  it("detects iPadOS desktop UA via touch points", () => {
    assert.equal(
      detectClientPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
      "ios",
    );
  });

  it("detects Android Chrome", () => {
    assert.equal(
      detectClientPlatform({
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      }),
      "android",
    );
  });

  it("detects desktop Chromium", () => {
    assert.equal(
      detectClientPlatform({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
      "desktop",
    );
  });
});

describe("installRequired", () => {
  it("requires Home Screen only on iOS", () => {
    assert.equal(installRequired("ios"), true);
    assert.equal(installRequired("android"), false);
    assert.equal(installRequired("desktop"), false);
  });
});

describe("statusHint", () => {
  it("tells iPhone users a Safari tab cannot receive push", () => {
    assert.match(statusHint("ios", false), /Home Screen is required/i);
    assert.match(statusHint("ios", false), /Safari tabs cannot receive Web Push/i);
  });

  it("allows Android and desktop Chromium in a browser tab", () => {
    assert.match(statusHint("android", false), /Android Chrome/i);
    assert.match(statusHint("desktop", false), /Chrome or Edge/i);
    assert.doesNotMatch(statusHint("android", false), /Home Screen is required/);
  });
});

describe("notificationsHint", () => {
  it("keeps the iOS Home Screen permission note", () => {
    assert.match(notificationsHint("ios"), /Home Screen/);
  });

  it("mentions OEM battery on Android and the padlock on desktop", () => {
    assert.match(notificationsHint("android"), /battery/i);
    assert.match(notificationsHint("desktop"), /padlock|Notifications/i);
  });
});
