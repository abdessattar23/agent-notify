export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type StoredSubscription = PushSubscriptionJSON & {
  createdAt: string;
  userAgent?: string;
};

export function parseSubscription(raw: unknown): PushSubscriptionJSON | { error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "subscription object required" };
  }
  const record = raw as Record<string, unknown>;
  const endpoint = record.endpoint;
  if (typeof endpoint !== "string" || !isHttpsEndpoint(endpoint)) {
    return { error: "subscription.endpoint must be an https URL" };
  }
  const keys = record.keys;
  if (keys === null || typeof keys !== "object" || Array.isArray(keys)) {
    return { error: "subscription.keys is required" };
  }
  const keyRecord = keys as Record<string, unknown>;
  if (typeof keyRecord.p256dh !== "string" || keyRecord.p256dh.length < 16) {
    return { error: "subscription.keys.p256dh is required" };
  }
  if (typeof keyRecord.auth !== "string" || keyRecord.auth.length < 8) {
    return { error: "subscription.keys.auth is required" };
  }
  const expirationTime =
    record.expirationTime === undefined || record.expirationTime === null
      ? null
      : record.expirationTime;
  if (expirationTime !== null && typeof expirationTime !== "number") {
    return { error: "subscription.expirationTime must be a number or null" };
  }
  return {
    endpoint,
    expirationTime,
    keys: {
      p256dh: keyRecord.p256dh,
      auth: keyRecord.auth,
    },
  };
}

export function parseEndpointBody(raw: unknown): string | { error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "JSON object with endpoint required" };
  }
  const endpoint = (raw as Record<string, unknown>).endpoint;
  if (typeof endpoint !== "string" || !isHttpsEndpoint(endpoint)) {
    return { error: "endpoint must be an https URL" };
  }
  return endpoint;
}

function isHttpsEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}
