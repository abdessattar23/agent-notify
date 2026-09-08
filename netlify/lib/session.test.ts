import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Context } from "@netlify/functions";
import handler from "../functions/session.ts";
import { createAgentToken, hashToken, lookupTokenAccount } from "./accounts.ts";
import { requireAccountAccess, resolveAgentAuth } from "./auth.ts";
import { resetRuntimeEnvCache } from "./env.ts";
import { consumeAgentRateLimit } from "./rate-limit.ts";
import {
  SESSION_COOKIE,
  loginAccount,
  sessionHeaders,
  signupAccount,
  verifySignedSession,
} from "./session.ts";

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

async function isolatedStore(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-notify-sess-"));
  process.env.BLOB_STORE_DIR = dir;
  return dir;
}

describe("session and agent auth", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await isolatedStore();
    process.env.SESSION_SECRET = "test-session-secret-value";
    process.env.MULTI_ACCOUNT = "1";
    delete process.env.INVITE_CODE;
    delete process.env.AGENT_API_TOKEN;
    resetRuntimeEnvCache();
  });

  afterEach(async () => {
    delete process.env.BLOB_STORE_DIR;
    delete process.env.SESSION_SECRET;
    delete process.env.MULTI_ACCOUNT;
    delete process.env.INVITE_CODE;
    delete process.env.AGENT_API_TOKEN;
    resetRuntimeEnvCache();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("signs up, logs in, and accepts the session cookie", async () => {
    const created = await signupAccount({
      email: "owner@example.com",
      password: "correct-horse",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const signed = created.signed;
    assert.ok(verifySignedSession(signed, "test-session-secret-value"));

    const req = new Request("https://example.com/api/me", {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(signed)}` },
    });
    const access = await requireAccountAccess(req);
    assert.equal(access.ok, true);
    if (!access.ok) return;
    assert.equal(access.mode, "multi");
    if (access.mode === "multi") assert.equal(access.accountId, created.account.id);

    const login = await loginAccount({
      email: "owner@example.com",
      password: "correct-horse",
    });
    assert.equal(login.ok, true);

    const bad = await loginAccount({
      email: "owner@example.com",
      password: "wrong-password",
    });
    assert.equal(bad.ok, false);
  });

  it("requires an invite code when INVITE_CODE is set", async () => {
    process.env.INVITE_CODE = "house-party";
    resetRuntimeEnvCache();
    const missing = await signupAccount({
      email: "a@example.com",
      password: "correct-horse",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "invite_required");

    const ok = await signupAccount({
      email: "a@example.com",
      password: "correct-horse",
      inviteCode: "house-party",
    });
    assert.equal(ok.ok, true);
  });

  it("rejects account B's token for account A", async () => {
    const a = await signupAccount({ email: "a@example.com", password: "correct-horse" });
    const b = await signupAccount({ email: "b@example.com", password: "correct-horse" });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;

    const tokenA = await createAgentToken(a.account.id, "A");
    const tokenB = await createAgentToken(b.account.id, "B");
    assert.equal(await lookupTokenAccount(hashToken(tokenA.token)), a.account.id);
    assert.equal(await lookupTokenAccount(hashToken(tokenB.token)), b.account.id);

    const reqB = new Request("https://example.com/v1/notify", {
      headers: { authorization: `Bearer ${tokenB.token}` },
    });
    const authB = await resolveAgentAuth(reqB);
    assert.equal(authB.ok, true);
    if (authB.ok && authB.mode === "multi") {
      assert.equal(authB.accountId, b.account.id);
      assert.notEqual(authB.accountId, a.account.id);
    }

    const reqWrong = new Request("https://example.com/v1/notify", {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    const denied = await resolveAgentAuth(reqWrong);
    assert.equal(denied.ok, false);
  });

  it("rate-limits accounts independently", async () => {
    const first = await consumeAgentRateLimit(1, "acct-a");
    const secondSame = await consumeAgentRateLimit(1, "acct-a");
    const other = await consumeAgentRateLimit(1, "acct-b");
    assert.equal(first.ok, true);
    assert.equal(secondSame.ok, false);
    assert.equal(other.ok, true);
  });

  it("builds https session cookies with Secure", () => {
    const headers = sessionHeaders(new Request("https://example.com/api/login"), "id.sig");
    const cookie = (headers as Record<string, string>)["set-cookie"];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
  });
});

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
