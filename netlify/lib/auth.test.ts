import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerToken, secretsEqual } from "./auth.ts";

describe("auth helpers", () => {
  it("extracts a Bearer token", () => {
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer secret-token" },
    });
    assert.equal(bearerToken(req), "secret-token");
  });

  it("compares secrets in constant time by hash", () => {
    assert.equal(secretsEqual("abc", "abc"), true);
    assert.equal(secretsEqual("abc", "abd"), false);
    assert.equal(secretsEqual("short", "longer-secret"), false);
  });
});
