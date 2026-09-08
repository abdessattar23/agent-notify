import { getRuntimeEnv } from "./env.ts";
import {
  createAgentToken,
  getAccount,
  getSiteClaim,
  listTokens,
  putAccount,
  putAccountInboxItem,
  putSiteClaim,
  upsertDeviceFromSubscription,
} from "./accounts.ts";
import { getInboxItem, listInboxItems, listSubscriptions } from "./store.ts";

export type ClaimResult =
  | {
      ok: true;
      devices: number;
      inbox: number;
      mappedLegacyToken: boolean;
    }
  | { ok: false; status: 404 | 409; error: string };

export async function isLegacyClaimAvailable(): Promise<boolean> {
  const claim = await getSiteClaim();
  if (claim) return false;
  const subs = await listSubscriptions();
  return subs.length > 0;
}

export async function claimLegacySite(accountId: string): Promise<ClaimResult> {
  const account = await getAccount(accountId);
  if (!account) {
    return { ok: false, status: 404, error: "not_found" };
  }
  const existing = await getSiteClaim();
  if (existing && existing.accountId !== accountId) {
    return { ok: false, status: 409, error: "already_claimed" };
  }
  if (existing && account.claimedLegacy) {
    return {
      ok: true,
      devices: 0,
      inbox: 0,
      mappedLegacyToken: false,
    };
  }

  const subscriptions = await listSubscriptions();
  let devices = 0;
  for (const { value } of subscriptions) {
    await upsertDeviceFromSubscription(accountId, value, { userAgent: value.userAgent });
    devices += 1;
  }

  const inboxItems = await listInboxItems(100);
  let inbox = 0;
  for (const item of inboxItems) {
    const full = (await getInboxItem(item.id)) ?? item;
    await putAccountInboxItem(accountId, full);
    inbox += 1;
  }

  let mappedLegacyToken = false;
  const env = getRuntimeEnv();
  if (env.agentApiToken) {
    const tokens = await listTokens(accountId);
    const already = tokens.some((token) => token.legacy);
    if (!already) {
      await createAgentToken(accountId, "Legacy AGENT_API_TOKEN", {
        rawToken: env.agentApiToken,
        legacy: true,
      });
      mappedLegacyToken = true;
    }
  }

  account.claimedLegacy = true;
  await putAccount(account);
  await putSiteClaim({ accountId, claimedAt: new Date().toISOString() });

  return { ok: true, devices, inbox, mappedLegacyToken };
}
