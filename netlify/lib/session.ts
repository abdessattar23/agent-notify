import { createHmac, timingSafeEqual } from "node:crypto";
import type { AccountRecord, SessionRecord } from "../../shared/account.ts";
import {
  createId,
  getAccount,
  getSession,
  indexEmail,
  indexInviteOnlyAccount,
  lookupAccountIdByEmail,
  lookupInviteOnlyAccountId,
  putAccount,
  putSession,
  deleteSession,
} from "./accounts.ts";
import { getRuntimeEnv } from "./env.ts";
import { hashPassword, validateEmail, validatePassword, verifyPassword } from "./password.ts";

export const SESSION_COOKIE = "an_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

export type SessionOk = { ok: true; account: AccountRecord; session: SessionRecord; signed: string };
export type SessionErr = { ok: false; status: 400 | 401 | 409 | 429 | 503; error: string };
export type SessionResult = SessionOk | SessionErr;

function signSessionId(id: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(id).digest("base64url");
  return `${id}.${sig}`;
}

export function verifySignedSession(value: string, secret: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!id || !sig) return null;
  const expected = createHmac("sha256", secret).update(id).digest("base64url");
  if (!hmacEqual(sig, expected)) return null;
  return id;
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SESSION_COOKIE}=`)) continue;
    return decodeURIComponent(trimmed.slice(SESSION_COOKIE.length + 1));
  }
  return null;
}

export function sessionCookieHeader(signed: string, maxAgeSec: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(signed)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, maxAgeSec)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(secure: boolean): string {
  return sessionCookieHeader("", 0, secure);
}

export function requestIsHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return proto === "https";
}

export function sessionHeaders(req: Request, signed: string | null): HeadersInit {
  const secure = requestIsHttps(req);
  return {
    "set-cookie":
      signed === null
        ? clearSessionCookieHeader(secure)
        : sessionCookieHeader(signed, SESSION_TTL_SEC, secure),
  };
}

export async function loadSession(req: Request): Promise<SessionRecord | null> {
  const env = getRuntimeEnv();
  if (!env.sessionSecret) return null;
  const raw = readSessionCookie(req);
  if (!raw) return null;
  const id = verifySignedSession(raw, env.sessionSecret);
  if (!id) return null;
  return getSession(id);
}

export async function createSignedSession(accountId: string): Promise<{ session: SessionRecord; signed: string }> {
  const env = getRuntimeEnv();
  if (!env.sessionSecret) {
    throw new Error("session_secret_unconfigured");
  }
  const now = new Date();
  const session: SessionRecord = {
    id: createId(),
    accountId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SEC * 1000).toISOString(),
  };
  await putSession(session);
  return { session, signed: signSessionId(session.id, env.sessionSecret) };
}

export async function destroySession(req: Request): Promise<void> {
  const session = await loadSession(req);
  if (session) await deleteSession(session.id);
}

export async function signupAccount(input: {
  email?: unknown;
  password: unknown;
  inviteCode?: unknown;
}): Promise<SessionResult> {
  const env = getRuntimeEnv();
  if (!env.sessionSecret) {
    return { ok: false, status: 503, error: "session_secret_unconfigured" };
  }
  const password = validatePassword(input.password);
  if (typeof password === "object") return { ok: false, status: 400, error: password.error };

  if (env.inviteCode) {
    if (typeof input.inviteCode !== "string" || !hmacEqual(input.inviteCode, env.inviteCode)) {
      return { ok: false, status: 401, error: "invite_required" };
    }
  }

  let email: string | null = null;
  if (input.email !== undefined && input.email !== null && input.email !== "") {
    const parsed = validateEmail(input.email);
    if (typeof parsed === "object") return { ok: false, status: 400, error: parsed.error };
    const existing = await lookupAccountIdByEmail(parsed);
    if (existing) return { ok: false, status: 409, error: "email_taken" };
    email = parsed;
  } else if (!env.inviteCode) {
    return { ok: false, status: 400, error: "email is required" };
  } else if (await lookupInviteOnlyAccountId()) {
    return { ok: false, status: 400, error: "email is required" };
  }

  const account: AccountRecord = {
    id: createId(),
    email,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await putAccount(account);
  if (email) await indexEmail(email, account.id);
  else await indexInviteOnlyAccount(account.id);
  const { session, signed } = await createSignedSession(account.id);
  return { ok: true, account, session, signed };
}

export async function loginAccount(input: {
  email?: unknown;
  password: unknown;
  inviteCode?: unknown;
}): Promise<SessionResult> {
  const env = getRuntimeEnv();
  if (!env.sessionSecret) {
    return { ok: false, status: 503, error: "session_secret_unconfigured" };
  }
  const password = validatePassword(input.password);
  if (typeof password === "object") return { ok: false, status: 400, error: password.error };

  let accountId: string | null = null;
  if (input.email !== undefined && input.email !== null && input.email !== "") {
    const parsed = validateEmail(input.email);
    if (typeof parsed === "object") return { ok: false, status: 400, error: parsed.error };
    accountId = await lookupAccountIdByEmail(parsed);
  } else if (typeof input.inviteCode === "string" && env.inviteCode && hmacEqual(input.inviteCode, env.inviteCode)) {
    accountId = await lookupInviteOnlyAccountId();
  }

  const account = accountId ? await getAccount(accountId) : null;
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return { ok: false, status: 401, error: "invalid_credentials" };
  }
  const { session, signed } = await createSignedSession(account.id);
  return { ok: true, account, session, signed };
}

function hmacEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}
