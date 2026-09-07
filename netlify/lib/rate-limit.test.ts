import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hourWindow, nextCount } from "./rate-limit.ts";

describe("rate limit windows", () => {
  it("keys by UTC hour and resets at the next hour", () => {
    const now = new Date("2026-09-07T12:34:00.000Z");
    const window = hourWindow(now);
    assert.equal(window.id, "2026-09-07T12");
    assert.equal(window.resetEpochSec, Date.parse("2026-09-07T13:00:00.000Z") / 1000);
  });

  it("starts a fresh count in a new window", () => {
    assert.equal(nextCount(null, "2026-09-07T12"), 1);
    assert.equal(nextCount({ count: 9, window: "2026-09-07T11" }, "2026-09-07T12"), 1);
    assert.equal(nextCount({ count: 9, window: "2026-09-07T12" }, "2026-09-07T12"), 10);
  });
});
