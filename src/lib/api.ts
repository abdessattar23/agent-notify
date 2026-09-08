import type { InboxItem } from "../../shared/notify.ts";
import type { PublicAccount, PublicDevice, PublicToken } from "../../shared/account.ts";
import type { TopicFilter } from "../../shared/topics.ts";

export type HealthResponse = {
  ok: boolean;
  service: string;
  vapidConfigured: boolean;
  agentTokenConfigured: boolean;
  ownerSetupRequired: boolean;
  subscriptionCount: number;
  multiAccount?: boolean;
  inviteRequired?: boolean;
  sessionSecretConfigured?: boolean;
  legacyClaimAvailable?: boolean;
};

export type NotifySummary = {
  ok: boolean;
  delivered?: number;
  failed?: number;
  pruned?: number;
  errors?: string[];
  error?: string;
  id?: string;
  topic?: string;
};

export type MeResponse = {
  ok: boolean;
  mode: "solo" | "multi";
  account: PublicAccount | null;
  deviceCount: number;
  tokenCount: number;
  topics: string[];
  legacyClaimAvailable: boolean;
  error?: string;
};

export type { InboxItem, PublicAccount, PublicDevice, PublicToken };

function ownerHeaders(secret: string): HeadersInit {
  return secret ? { "X-Owner-Secret": secret } : {};
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch("/api/vapid-public-key");
  const data = (await res.json()) as { ok?: boolean; publicKey?: string; error?: string };
  if (!res.ok || !data.publicKey) {
    throw new Error(data.error ?? "VAPID public key unavailable");
  }
  return data.publicKey;
}

export async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  const data = (await res.json()) as MeResponse;
  if (!res.ok) {
    throw new Error(data.error ?? `Me failed (${res.status})`);
  }
  return data;
}

export async function signup(input: {
  email?: string;
  password: string;
  inviteCode?: string;
}): Promise<PublicAccount> {
  const res = await fetch("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { ok?: boolean; account?: PublicAccount; error?: string };
  if (!res.ok || !data.account) {
    throw new Error(data.error ?? `Signup failed (${res.status})`);
  }
  return data.account;
}

export async function login(input: {
  email?: string;
  password: string;
  inviteCode?: string;
}): Promise<PublicAccount> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { ok?: boolean; account?: PublicAccount; error?: string };
  if (!res.ok || !data.account) {
    throw new Error(data.error ?? `Login failed (${res.status})`);
  }
  return data.account;
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}

export async function claimLegacy(): Promise<{ devices: number; inbox: number; mappedLegacyToken: boolean }> {
  const res = await fetch("/api/claim", { method: "POST" });
  const data = (await res.json()) as {
    ok?: boolean;
    devices?: number;
    inbox?: number;
    mappedLegacyToken?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Claim failed (${res.status})`);
  }
  return {
    devices: data.devices ?? 0,
    inbox: data.inbox ?? 0,
    mappedLegacyToken: Boolean(data.mappedLegacyToken),
  };
}

export async function postSubscription(
  subscription: PushSubscriptionJSON,
  secret: string,
  topics?: TopicFilter,
): Promise<void> {
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...ownerHeaders(secret),
    },
    body: JSON.stringify({ ...subscription, topics }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, `Subscribe failed (${res.status})`));
  }
}

export async function deleteSubscription(endpoint: string, secret: string): Promise<void> {
  const res = await fetch("/api/subscribe", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...ownerHeaders(secret),
    },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(await readError(res, `Unsubscribe failed (${res.status})`));
  }
}

export async function fetchDevices(): Promise<PublicDevice[]> {
  const res = await fetch("/api/devices");
  const data = (await res.json()) as { ok?: boolean; devices?: PublicDevice[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Devices failed (${res.status})`);
  }
  return data.devices ?? [];
}

export async function patchDeviceTopics(id: string, topics: TopicFilter): Promise<PublicDevice> {
  const res = await fetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topics }),
  });
  const data = (await res.json()) as { ok?: boolean; device?: PublicDevice; error?: string };
  if (!res.ok || !data.device) {
    throw new Error(data.error ?? `Device update failed (${res.status})`);
  }
  return data.device;
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(await readError(res, `Device delete failed (${res.status})`));
  }
}

export async function fetchTokens(): Promise<PublicToken[]> {
  const res = await fetch("/api/tokens");
  const data = (await res.json()) as { ok?: boolean; tokens?: PublicToken[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Tokens failed (${res.status})`);
  }
  return data.tokens ?? [];
}

export async function createToken(name: string): Promise<PublicToken & { token: string }> {
  const res = await fetch("/api/tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = (await res.json()) as (PublicToken & { ok?: boolean; token?: string; error?: string });
  if (!res.ok || !data.token) {
    throw new Error(data.error ?? `Create token failed (${res.status})`);
  }
  return data as PublicToken & { token: string };
}

export async function deleteToken(id: string): Promise<void> {
  const res = await fetch(`/api/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(await readError(res, `Delete token failed (${res.status})`));
  }
}

export async function postTestPing(secret: string): Promise<NotifySummary> {
  const res = await fetch("/api/ping", {
    method: "POST",
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as NotifySummary;
  if (!res.ok) {
    throw new Error(data.error ?? `Ping failed (${res.status})`);
  }
  return data;
}

export async function fetchInbox(secret: string, limit = 50, topic?: string): Promise<InboxItem[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (topic) params.set("topic", topic);
  const res = await fetch(`/api/inbox?${params.toString()}`, {
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as { ok?: boolean; items?: InboxItem[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Inbox failed (${res.status})`);
  }
  return data.items ?? [];
}

export async function fetchInboxItem(id: string, secret: string): Promise<InboxItem> {
  const res = await fetch(`/api/inbox?id=${encodeURIComponent(id)}`, {
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as { ok?: boolean; item?: InboxItem; error?: string };
  if (!res.ok || !data.item) {
    throw new Error(data.error ?? `Inbox item failed (${res.status})`);
  }
  return data.item;
}
