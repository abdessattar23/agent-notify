import webpush from "web-push";
import {
  buildDeclarativePayload,
  createInboxId,
  isGonePushStatus,
  toInboxItem,
  type NotifyInput,
} from "../../shared/notify.ts";
import type { StoredSubscription } from "../../shared/subscription.ts";
import { getRuntimeEnv, vapidConfigured } from "./env.ts";
import { deleteSubscription, listSubscriptions, putInboxItem } from "./store.ts";

export type SendSummary = {
  delivered: number;
  failed: number;
  pruned: number;
  errors: string[];
  id?: string;
};

let vapidApplied = false;

function applyVapid(): void {
  const env = getRuntimeEnv();
  if (!vapidConfigured(env)) {
    throw new Error("vapid_unconfigured");
  }
  if (!vapidApplied) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    vapidApplied = true;
  }
}

export async function sendToAllSubscriptions(
  input: NotifyInput,
  origin: string,
  options?: { persistInbox?: boolean; inboxId?: string },
): Promise<SendSummary> {
  applyVapid();
  const inboxId = options?.inboxId ?? createInboxId();
  if (options?.persistInbox !== false) {
    await putInboxItem(toInboxItem(input, inboxId));
  }
  const payload = JSON.stringify(buildDeclarativePayload(input, origin, inboxId));
  const subscriptions = await listSubscriptions();
  const summary: SendSummary = { delivered: 0, failed: 0, pruned: 0, errors: [], id: inboxId };

  for (const { key, value } of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: value.endpoint,
          keys: value.keys,
        },
        payload,
        {
          TTL: 86_400,
          urgency: "high",
          contentEncoding: "aes128gcm",
        },
      );
      summary.delivered += 1;
    } catch (error) {
      const status = pushStatus(error);
      if (status !== null && isGonePushStatus(status)) {
        await deleteSubscription(value.endpoint);
        summary.pruned += 1;
        continue;
      }
      summary.failed += 1;
      summary.errors.push(`${key}: ${errorMessage(error)}`);
    }
  }

  return summary;
}

function pushStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return typeof statusCode === "number" ? statusCode : null;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "push_failed";
}

export type { StoredSubscription };
