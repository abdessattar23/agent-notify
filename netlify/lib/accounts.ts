import { createHash, randomBytes } from "node:crypto";
import type {
  AccountRecord,
  AgentTokenRecord,
  DeviceRecord,
  SessionRecord,
  TopicRecord,
} from "../../shared/account.ts";
import type { InboxItem } from "../../shared/notify.ts";
import { ALL_TOPICS, deviceMatchesTopic, type TopicFilter } from "../../shared/topics.ts";
import { namedStore, subscriptionKey, type BlobStore } from "./store.ts";

const ACCOUNTS = "accounts";
const SESSIONS = "sessions";
const EMAIL_INDEX = "email_index";
const TOKEN_INDEX = "token_index";
const SITE = "site";
const INBOX_INDEX = "index";
const INBOX_MAX = 100;
const INVITE_EMAIL_KEY = "invite";
const CLAIM_KEY = "claim";

export type SiteClaim = {
  accountId: string;
  claimedAt: string;
};

function accountsStore(): BlobStore {
  return namedStore(ACCOUNTS);
}

function sessionsStore(): BlobStore {
  return namedStore(SESSIONS);
}

function emailIndexStore(): BlobStore {
  return namedStore(EMAIL_INDEX);
}

function tokenIndexStore(): BlobStore {
  return namedStore(TOKEN_INDEX);
}

function siteStore(): BlobStore {
  return namedStore(SITE);
}

export function deviceStoreKey(accountId: string, deviceId: string): string {
  return `${accountId}/devices/${deviceId}`;
}

export function tokenStoreKey(accountId: string, hash: string): string {
  return `${accountId}/tokens/${hash}`;
}

export function topicStoreKey(accountId: string, name: string): string {
  return `${accountId}/topics/${name}`;
}

export function inboxItemStoreKey(accountId: string, id: string): string {
  return `${accountId}/inbox/${id}`;
}

export function inboxIndexStoreKey(accountId: string): string {
  return `${accountId}/inbox/${INBOX_INDEX}`;
}

export function rateLimitStoreKey(accountId: string): string {
  return `${accountId}/ratelimit/agent-hourly`;
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return randomBytes(16).toString("hex");
}

export async function hasAnyAccount(): Promise<boolean> {
  const keys = await accountsStore().listKeys();
  return keys.some((key) => isAccountProfileKey(key));
}

export function isAccountProfileKey(key: string): boolean {
  return Boolean(key) && !key.includes("/");
}

export async function getAccount(accountId: string): Promise<AccountRecord | null> {
  if (!accountId || accountId.includes("/")) return null;
  return accountsStore().getJSON<AccountRecord>(accountId);
}

export async function putAccount(account: AccountRecord): Promise<void> {
  await accountsStore().setJSON(account.id, account);
}

export async function lookupAccountIdByEmail(email: string): Promise<string | null> {
  const row = await emailIndexStore().getJSON<{ accountId: string }>(hashEmail(email));
  return row?.accountId ?? null;
}

export async function lookupInviteOnlyAccountId(): Promise<string | null> {
  const row = await emailIndexStore().getJSON<{ accountId: string }>(INVITE_EMAIL_KEY);
  return row?.accountId ?? null;
}

export async function indexEmail(email: string, accountId: string): Promise<void> {
  await emailIndexStore().setJSON(hashEmail(email), { accountId });
}

export async function indexInviteOnlyAccount(accountId: string): Promise<void> {
  await emailIndexStore().setJSON(INVITE_EMAIL_KEY, { accountId });
}

export async function getDevice(accountId: string, deviceId: string): Promise<DeviceRecord | null> {
  return accountsStore().getJSON<DeviceRecord>(deviceStoreKey(accountId, deviceId));
}

export async function putDevice(accountId: string, device: DeviceRecord): Promise<void> {
  await accountsStore().setJSON(deviceStoreKey(accountId, device.id), device);
}

export async function deleteDevice(accountId: string, deviceId: string): Promise<boolean> {
  const key = deviceStoreKey(accountId, deviceId);
  const existing = await accountsStore().getJSON(key);
  if (!existing) return false;
  await accountsStore().delete(key);
  return true;
}

export async function deleteDeviceByEndpoint(accountId: string, endpoint: string): Promise<boolean> {
  const id = await subscriptionKey(endpoint);
  return deleteDevice(accountId, id);
}

export async function listDevices(accountId: string): Promise<DeviceRecord[]> {
  const prefix = `${accountId}/devices/`;
  const keys = await accountsStore().listKeys(prefix);
  const devices: DeviceRecord[] = [];
  for (const key of keys) {
    const device = await accountsStore().getJSON<DeviceRecord>(key);
    if (device?.id && device.endpoint && device.keys) {
      devices.push(device);
    }
  }
  return devices;
}

export async function devicesForTopic(accountId: string, topic?: string | null): Promise<DeviceRecord[]> {
  const devices = await listDevices(accountId);
  return devices.filter((device) => deviceMatchesTopic(device.topics, topic));
}

export async function upsertDeviceFromSubscription(
  accountId: string,
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  },
  options?: { userAgent?: string; topics?: TopicFilter },
): Promise<DeviceRecord> {
  const id = await subscriptionKey(subscription.endpoint);
  const existing = await getDevice(accountId, id);
  const device: DeviceRecord = {
    id,
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: subscription.keys,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    userAgent: options?.userAgent ?? existing?.userAgent,
    topics: options?.topics ?? existing?.topics ?? ALL_TOPICS,
  };
  await putDevice(accountId, device);
  return device;
}

export async function putToken(accountId: string, token: AgentTokenRecord): Promise<void> {
  await accountsStore().setJSON(tokenStoreKey(accountId, token.hash), token);
  await tokenIndexStore().setJSON(token.hash, { accountId, id: token.id });
}

export async function getToken(accountId: string, hash: string): Promise<AgentTokenRecord | null> {
  return accountsStore().getJSON<AgentTokenRecord>(tokenStoreKey(accountId, hash));
}

export async function listTokens(accountId: string): Promise<AgentTokenRecord[]> {
  const prefix = `${accountId}/tokens/`;
  const keys = await accountsStore().listKeys(prefix);
  const tokens: AgentTokenRecord[] = [];
  for (const key of keys) {
    const token = await accountsStore().getJSON<AgentTokenRecord>(key);
    if (token?.id && token.hash) tokens.push(token);
  }
  tokens.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return tokens;
}

export async function deleteToken(accountId: string, tokenId: string): Promise<boolean> {
  const tokens = await listTokens(accountId);
  const match = tokens.find((token) => token.id === tokenId || token.hash === tokenId);
  if (!match) return false;
  await accountsStore().delete(tokenStoreKey(accountId, match.hash));
  await tokenIndexStore().delete(match.hash);
  return true;
}

export async function lookupTokenAccount(hash: string): Promise<string | null> {
  const row = await tokenIndexStore().getJSON<{ accountId: string }>(hash);
  return row?.accountId ?? null;
}

export async function touchToken(accountId: string, hash: string): Promise<void> {
  const token = await getToken(accountId, hash);
  if (!token) return;
  token.lastUsedAt = new Date().toISOString();
  await accountsStore().setJSON(tokenStoreKey(accountId, hash), token);
}

export function createAgentTokenSecret(): string {
  return `ant_${randomBytes(24).toString("base64url")}`;
}

export async function createAgentToken(
  accountId: string,
  name = "Agent token",
  options?: { rawToken?: string; legacy?: boolean },
): Promise<{ token: string; record: AgentTokenRecord }> {
  const raw = options?.rawToken ?? createAgentTokenSecret();
  const hash = hashToken(raw);
  const record: AgentTokenRecord = {
    id: createId(),
    hash,
    prefix: raw.slice(0, 8),
    name: name.trim() || "Agent token",
    createdAt: new Date().toISOString(),
    ...(options?.legacy ? { legacy: true } : {}),
  };
  await putToken(accountId, record);
  return { token: raw, record };
}

export async function putTopic(accountId: string, name: string): Promise<TopicRecord> {
  const existing = await accountsStore().getJSON<TopicRecord>(topicStoreKey(accountId, name));
  if (existing) return existing;
  const record: TopicRecord = { name, createdAt: new Date().toISOString() };
  await accountsStore().setJSON(topicStoreKey(accountId, name), record);
  return record;
}

export async function listTopics(accountId: string): Promise<TopicRecord[]> {
  const prefix = `${accountId}/topics/`;
  const keys = await accountsStore().listKeys(prefix);
  const topics: TopicRecord[] = [];
  for (const key of keys) {
    const topic = await accountsStore().getJSON<TopicRecord>(key);
    if (topic?.name) topics.push(topic);
  }
  topics.sort((a, b) => a.name.localeCompare(b.name));
  return topics;
}

export async function putAccountInboxItem(accountId: string, item: InboxItem): Promise<void> {
  const store = accountsStore();
  await store.setJSON(inboxItemStoreKey(accountId, item.id), item);
  const indexKey = inboxIndexStoreKey(accountId);
  const index = (await store.getJSON<string[]>(indexKey)) ?? [];
  const next = [item.id, ...index.filter((id) => id !== item.id)];
  const pruned = next.slice(INBOX_MAX);
  const kept = next.slice(0, INBOX_MAX);
  await store.setJSON(indexKey, kept);
  for (const id of pruned) {
    await store.delete(inboxItemStoreKey(accountId, id));
  }
}

export async function getAccountInboxItem(accountId: string, id: string): Promise<InboxItem | null> {
  if (!id || id === INBOX_INDEX) return null;
  return accountsStore().getJSON<InboxItem>(inboxItemStoreKey(accountId, id));
}

export async function listAccountInboxItems(
  accountId: string,
  options?: { limit?: number; topic?: string },
): Promise<InboxItem[]> {
  const store = accountsStore();
  let index = (await store.getJSON<string[]>(inboxIndexStoreKey(accountId))) ?? [];
  if (index.length === 0) {
    const prefix = `${accountId}/inbox/`;
    index = (await store.listKeys(prefix))
      .map((key) => key.slice(prefix.length))
      .filter((key) => key && key !== INBOX_INDEX);
  }
  const items: InboxItem[] = [];
  const cap = Math.max(1, Math.min(options?.limit ?? 50, INBOX_MAX));
  for (const id of index) {
    const item = await store.getJSON<InboxItem>(inboxItemStoreKey(accountId, id));
    if (!item?.id || !item.title) continue;
    if (options?.topic && item.topic !== options.topic) continue;
    items.push(item);
    if (items.length >= cap) break;
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return items.slice(0, cap);
}

export async function putSession(session: SessionRecord): Promise<void> {
  await sessionsStore().setJSON(session.id, session);
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  if (!sessionId) return null;
  const session = await sessionsStore().getJSON<SessionRecord>(sessionId);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await sessionsStore().delete(sessionId);
    return null;
  }
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await sessionsStore().delete(sessionId);
}

export async function getSiteClaim(): Promise<SiteClaim | null> {
  return siteStore().getJSON<SiteClaim>(CLAIM_KEY);
}

export async function putSiteClaim(claim: SiteClaim): Promise<void> {
  await siteStore().setJSON(CLAIM_KEY, claim);
}
