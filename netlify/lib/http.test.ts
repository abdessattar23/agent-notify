import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetRuntimeEnvCache } from "./env.ts";
import { requireAgentToken, requireOwnerAccess } from "./auth.ts";

describe("request auth", () => {
  afterEach(() => {
    delete process.env.AGENT_API_TOKEN;
    delete process.env.OWNER_SETUP_SECRET;
    resetRuntimeEnvCache();
  });

  it("rejects notify without a matching bearer token", () => {
    process.env.AGENT_API_TOKEN = "expected-token";
    resetRuntimeEnvCache();
    const req = new Request("https://example.com/v1/notify", {
      headers: { authorization: "Bearer wrong" },
    });
    const result = requireAgentToken(req);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it("allows owner routes when no setup secret is configured", () => {
    resetRuntimeEnvCache();
    const req = new Request("https://example.com/api/subscribe");
    assert.deepEqual(requireOwnerAccess(req), { ok: true });
  });

  it("requires the owner secret when configured", () => {
    process.env.OWNER_SETUP_SECRET = "house-key";
    resetRuntimeEnvCache();
    const missing = requireOwnerAccess(new Request("https://example.com/api/ping"));
    assert.equal(missing.ok, false);
    const present = requireOwnerAccess(
      new Request("https://example.com/api/ping", {
        headers: { "x-owner-secret": "house-key" },
      }),
    );
    assert.deepEqual(present, { ok: true });
  });
});
