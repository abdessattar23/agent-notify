import type { Config, Context } from "@netlify/functions";
import { toPublicAccount } from "../../shared/account.ts";
import { getAccount, listDevices, listTokens, listTopics } from "../lib/accounts.ts";
import { requireAccountAccess } from "../lib/auth.ts";
import { isLegacyClaimAvailable, claimLegacySite } from "../lib/claim.ts";
import { getRuntimeEnv } from "../lib/env.ts";
import { clientIp, json, methodNotAllowed, optionsResponse, readJson } from "../lib/http.ts";
import { consumeSignupRateLimit, rateLimitHeaders } from "../lib/rate-limit.ts";
import {
  destroySession,
  loginAccount,
  sessionHeaders,
  signupAccount,
} from "../lib/session.ts";

export default async function handler(req: Request, context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
    case "POST":
      return route(req, context);
    default:
      return methodNotAllowed(["GET", "POST", "OPTIONS"]);
  }
}

async function route(req: Request, context: Context): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/$/, "") || "/";
  const action = path.split("/").pop() ?? "";
  switch (action) {
    case "signup":
      if (req.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
      return signup(req);
    case "login":
      if (req.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
      return login(req);
    case "logout":
      if (req.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
      return logout(req);
    case "me":
      if (req.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
      return me(req);
    case "claim":
      if (req.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
      return claim(req);
    default: {
      void context;
      return json({ ok: false, error: "not_found" }, 404);
    }
  }
}

async function signup(req: Request): Promise<Response> {
  const env = getRuntimeEnv();
  if (!env.multiAccount) {
    return json({ ok: false, error: "multi_account_disabled" }, 403);
  }
  const limit = await consumeSignupRateLimit(env.signupRateLimitPerHour, clientIp(req));
  if (!limit.ok) {
    return json(
      { ok: false, error: "rate_limited", retryAfter: limit.resetEpochSec },
      429,
      rateLimitHeaders(limit),
    );
  }
  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400, rateLimitHeaders(limit));
  }
  const record = asRecord(body.value);
  const result = await signupAccount({
    email: record.email,
    password: record.password,
    inviteCode: record.inviteCode,
  });
  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status, rateLimitHeaders(limit));
  }
  return json(
    { ok: true, account: toPublicAccount(result.account) },
    201,
    { ...rateLimitHeaders(limit), ...sessionHeaders(req, result.signed) },
  );
}

async function login(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) {
    return json({ ok: false, error: body.error }, 400);
  }
  const record = asRecord(body.value);
  const result = await loginAccount({
    email: record.email,
    password: record.password,
    inviteCode: record.inviteCode,
  });
  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status);
  }
  return json(
    { ok: true, account: toPublicAccount(result.account) },
    200,
    sessionHeaders(req, result.signed),
  );
}

async function logout(req: Request): Promise<Response> {
  await destroySession(req);
  return json({ ok: true }, 200, sessionHeaders(req, null));
}

async function me(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }
  if (auth.mode === "solo") {
    return json({
      ok: true,
      mode: "solo",
      account: null,
      deviceCount: 0,
      tokenCount: 0,
      topics: [],
      legacyClaimAvailable: false,
    });
  }
  const account = await getAccount(auth.accountId);
  if (!account) {
    return json({ ok: false, error: "session_required" }, 401);
  }
  const [devices, tokens, topics, legacyClaimAvailable] = await Promise.all([
    listDevices(auth.accountId),
    listTokens(auth.accountId),
    listTopics(auth.accountId),
    isLegacyClaimAvailable(),
  ]);
  return json({
    ok: true,
    mode: "multi",
    account: toPublicAccount(account),
    deviceCount: devices.length,
    tokenCount: tokens.length,
    topics: topics.map((topic) => topic.name),
    legacyClaimAvailable,
  });
}

async function claim(req: Request): Promise<Response> {
  const auth = await requireAccountAccess(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }
  if (auth.mode === "solo") {
    return json({ ok: false, error: "multi_account_disabled" }, 403);
  }
  const result = await claimLegacySite(auth.accountId);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status);
  }
  return json({
    ok: true,
    devices: result.devices,
    inbox: result.inbox,
    mappedLegacyToken: result.mappedLegacyToken,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export const config: Config = {
  path: ["/api/signup", "/api/login", "/api/logout", "/api/me", "/api/claim"],
  method: ["GET", "POST", "OPTIONS"],
};
