import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deviceMatchesTopic, normalizeTopicName, parseTopicFilter } from "./topics.ts";

describe("normalizeTopicName", () => {
  it("lowercases and accepts dotted names", () => {
    assert.equal(normalizeTopicName(" Deploys "), "deploys");
    assert.equal(normalizeTopicName("ci.main"), "ci.main");
  });

  it("rejects reserved *, empty, and unsafe names", () => {
    assert.deepEqual(normalizeTopicName("*"), { error: "topic name '*' is reserved" });
    assert.deepEqual(normalizeTopicName("  "), { error: "topic is required" });
    assert.equal(typeof normalizeTopicName("bad topic") === "object", true);
    assert.equal(typeof normalizeTopicName("x".repeat(65)) === "object", true);
  });
});

describe("parseTopicFilter", () => {
  it("defaults missing values to all-topics", () => {
    assert.equal(parseTopicFilter(undefined), "*");
    assert.equal(parseTopicFilter("*"), "*");
  });

  it("dedupes explicit topic lists", () => {
    assert.deepEqual(parseTopicFilter(["Deploys", "deploys", "alerts"]), ["deploys", "alerts"]);
  });

  it("rejects non-array filters", () => {
    assert.deepEqual(parseTopicFilter("deploys"), {
      error: "topics must be '*' or an array of topic names",
    });
  });
});

describe("deviceMatchesTopic", () => {
  it("fans out no-topic notifies to every device", () => {
    assert.equal(deviceMatchesTopic("*", undefined), true);
    assert.equal(deviceMatchesTopic(["deploys"], undefined), true);
    assert.equal(deviceMatchesTopic(["deploys"], null), true);
  });

  it("lets all-topics devices receive named topics", () => {
    assert.equal(deviceMatchesTopic("*", "deploys"), true);
    assert.equal(deviceMatchesTopic(undefined, "deploys"), true);
  });

  it("filters explicit topic lists", () => {
    assert.equal(deviceMatchesTopic(["deploys", "alerts"], "deploys"), true);
    assert.equal(deviceMatchesTopic(["deploys"], "alerts"), false);
    assert.equal(deviceMatchesTopic([], "deploys"), false);
  });
});
