import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
const N = 16_384;
const R = 8;
const P = 1;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;
  const derived = await scryptAsync(password, salt, expected.length, { N: n, r, p });
  return timingSafeEqual(derived, expected);
}

export function validatePassword(password: unknown): string | { error: string } {
  if (typeof password !== "string" || password.length < 8) {
    return { error: "password must be at least 8 characters" };
  }
  if (password.length > 200) {
    return { error: "password must be 200 characters or fewer" };
  }
  return password;
}

export function validateEmail(email: unknown): string | { error: string } {
  if (typeof email !== "string") {
    return { error: "email must be a string" };
  }
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 254 || !trimmed.includes("@") || !trimmed.includes(".")) {
    return { error: "email is invalid" };
  }
  return trimmed;
}
