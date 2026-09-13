import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import type { InboxItem } from "../../shared/notify.ts";
import type { StoredSubscription } from "../../shared/subscription.ts";

export type BlobStore = {
  getJSON: <T>(key: string) => Promise<T | null>;
  setJSON: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  listKeys: () => Promise<string[]>;
};

const SUBSCRIPTIONS = "subscriptions";
const TOKENS = "tokens";
const INBOX = "inbox";
const OS_ADAPTER = "os-adapter";
const INBOX_INDEX_KEY = "index";
const INBOX_MAX = 100;

export function subscriptionsStore(): BlobStore {
  return openStore(SUBSCRIPTIONS);
}

export function tokensStore(): BlobStore {
  return openStore(TOKENS);
}

export function inboxStore(): BlobStore {
  return openStore(INBOX);
}

export function osAdapterStore(): BlobStore {
  return openStore(OS_ADAPTER);
}

export async function putSubscription(subscription: StoredSubscription): Promise<string> {
  const key = await subscriptionKey(subscription.endpoint);
  await subscriptionsStore().setJSON(key, subscription);
  return key;
}

export async function deleteSubscription(endpoint: string): Promise<boolean> {
  const store = subscriptionsStore();
  const key = await subscriptionKey(endpoint);
  const existing = await store.getJSON(key);
  if (!existing) return false;
  await store.delete(key);
  return true;
}

export async function listSubscriptions(): Promise<Array<{ key: string; value: StoredSubscription }>> {
  const store = subscriptionsStore();
  const keys = await store.listKeys();
  const rows: Array<{ key: string; value: StoredSubscription }> = [];
  for (const key of keys) {
    const value = await store.getJSON<StoredSubscription>(key);
    if (value?.endpoint && value.keys) {
      rows.push({ key, value });
    }
  }
  return rows;
}

export async function putInboxItem(item: InboxItem): Promise<void> {
  const store = inboxStore();
  await store.setJSON(item.id, item);
  const index = (await store.getJSON<string[]>(INBOX_INDEX_KEY)) ?? [];
  const next = [item.id, ...index.filter((id) => id !== item.id)];
  const pruned = next.slice(INBOX_MAX);
  const kept = next.slice(0, INBOX_MAX);
  await store.setJSON(INBOX_INDEX_KEY, kept);
  for (const id of pruned) {
    await store.delete(id);
  }
}

export async function getInboxItem(id: string): Promise<InboxItem | null> {
  if (!id || id === INBOX_INDEX_KEY) return null;
  return inboxStore().getJSON<InboxItem>(id);
}

export async function listInboxItems(limit = 50): Promise<InboxItem[]> {
  const store = inboxStore();
  let index = (await store.getJSON<string[]>(INBOX_INDEX_KEY)) ?? [];
  if (index.length === 0) {
    index = (await store.listKeys()).filter((key) => key !== INBOX_INDEX_KEY);
  }
  const items: InboxItem[] = [];
  const cap = Math.max(1, Math.min(limit, INBOX_MAX));
  for (const id of index.slice(0, cap)) {
    const item = await store.getJSON<InboxItem>(id);
    if (item?.id && item.title) {
      items.push(item);
    }
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return items.slice(0, cap);
}

export async function subscriptionKey(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function openStore(name: string): BlobStore {
  // Production Functions do not always set NETLIFY=true; Lambda markers do.
  if (isNetlifyRuntime()) {
    return wrapNetlifyStore(name);
  }
  return createFileStore(name);
}

function isNetlifyRuntime(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

function wrapNetlifyStore(name: string): BlobStore {
  const store = getStore(name);
  return {
    async getJSON<T>(key: string) {
      const value = await store.get(key, { type: "json" });
      return (value as T | null) ?? null;
    },
    async setJSON(key, value) {
      await store.setJSON(key, value);
    },
    async delete(key) {
      await store.delete(key);
    },
    async listKeys() {
      const { blobs } = await store.list();
      return blobs.map((blob) => blob.key);
    },
  };
}

function createFileStore(name: string): BlobStore {
  const dir = join(process.cwd(), ".data", "blobs", name);
  return {
    async getJSON<T>(key: string) {
      try {
        const text = await readFile(join(dir, encodeURIComponent(key)), "utf8");
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, encodeURIComponent(key)), JSON.stringify(value), "utf8");
    },
    async delete(key) {
      await rm(join(dir, encodeURIComponent(key)), { force: true });
    },
    async listKeys() {
      try {
        const files = await readdir(dir);
        return files.map((file) => decodeURIComponent(file));
      } catch {
        return [];
      }
    },
  };
}
