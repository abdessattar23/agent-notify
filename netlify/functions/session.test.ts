import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Context } from "@netlify/functions";
import { resetRuntimeEnvCache } from "../lib/env.ts";
import handler from "./session.ts";

function context(): Context {
  return {
    cookies: { get: () => undefined, set: () => undefined, delete: () => undefined },
    params: {},
    requestId: "test",
  } as unknown as Context;
}

function cookieFrom(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  if (!header) return null;
  const match = /an_session=([^;]+)/.exec(header);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

describe("session HTTP handlers", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-notify-http-"));
    process.env.BLOB_STORE_DIR = dir;
    process.env.MULTI_ACCOUNT = "1";
    process.env.SESSION_SECRET = "handler-session-secret";
    resetRuntimeEnvCache();
  });

  afterEach(async () => {
    delete process.env.BLOB_STORE_DIR;
    delete process.env.MULTI_ACCOUNT;
    delete process.env.SESSION_SECRET;
    resetRuntimeEnvCache();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("signs up and returns /api/me for that account only", async () => {
    const signup = await handler(
      new Request("https://example.com/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "one@example.com", password: "correct-horse" }),
      }),
      context(),
    );
    assert.equal(signup.status, 201);
    const cookie = cookieFrom(signup);
    assert.ok(cookie);

    const me = await handler(
      new Request("https://example.com/api/me", {
        headers: { cookie: `an_session=${cookie}` },
      }),
      context(),
    );
    assert.equal(me.status, 200);
    const body = (await me.json()) as { account?: { email?: string }; mode?: string };
    assert.equal(body.mode, "multi");
    assert.equal(body.account?.email, "one@example.com");
  });
});
