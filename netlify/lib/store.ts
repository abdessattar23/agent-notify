import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import type { StoredSubscription } from "../../shared/subscription.ts";

export type BlobStore = {
  getJSON: <T>(key: string) => Promise<T | null>;
  setJSON: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  listKeys: () => Promise<string[]>;
};

const SUBSCRIPTIONS = "subscriptions";
const TOKENS = "tokens";

export function subscriptionsStore(): BlobStore {
  return openStore(SUBSCRIPTIONS);
}

export function tokensStore(): BlobStore {
  return openStore(TOKENS);
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

export async function subscriptionKey(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function openStore(name: string): BlobStore {
  if (process.env.NETLIFY || process.env.NETLIFY_DEV) {
    return wrapNetlifyStore(name);
  }
  return createFileStore(name);
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
