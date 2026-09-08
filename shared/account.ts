import type { InboxItem } from "./notify.ts";
import type { TopicFilter } from "./topics.ts";

export type AccountRecord = {
  id: string;
  email: string | null;
  passwordHash: string;
  createdAt: string;
  claimedLegacy?: boolean;
};

export type DeviceRecord = {
  id: string;
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  userAgent?: string;
  topics: TopicFilter;
};

export type AgentTokenRecord = {
  id: string;
  hash: string;
  prefix: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  legacy?: boolean;
};

export type TopicRecord = {
  name: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
};

export type PublicDevice = {
  id: string;
  createdAt: string;
  userAgent?: string;
  topics: TopicFilter;
  endpointTail: string;
};

export type PublicToken = {
  id: string;
  prefix: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  legacy?: boolean;
};

export type PublicAccount = {
  id: string;
  email: string | null;
  createdAt: string;
  claimedLegacy?: boolean;
};

export type AccountInboxItem = InboxItem & {
  topic?: string;
};

export function toPublicDevice(device: DeviceRecord): PublicDevice {
  return {
    id: device.id,
    createdAt: device.createdAt,
    ...(device.userAgent ? { userAgent: device.userAgent } : {}),
    topics: device.topics,
    endpointTail: device.endpoint.slice(-18),
  };
}

export function toPublicToken(token: AgentTokenRecord): PublicToken {
  return {
    id: token.id,
    prefix: token.prefix,
    name: token.name,
    createdAt: token.createdAt,
    ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt } : {}),
    ...(token.legacy ? { legacy: true } : {}),
  };
}

export function toPublicAccount(account: AccountRecord): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    createdAt: account.createdAt,
    ...(account.claimedLegacy ? { claimedLegacy: true } : {}),
  };
}
