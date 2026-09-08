import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ALL_TOPICS } from "../../shared/topics.ts";
import {
  createAgentToken,
  devicesForTopic,
  getAccountInboxItem,
  hashToken,
  hasAnyAccount,
  listAccountInboxItems,
  listDevices,
  lookupTokenAccount,
  putAccount,
  putAccountInboxItem,
  upsertDeviceFromSubscription,
} from "./accounts.ts";
import { claimLegacySite } from "./claim.ts";
import { resetRuntimeEnvCache } from "./env.ts";
import { resolveAppMode } from "./mode.ts";
import { putSubscription } from "./store.ts";

async function isolatedStore(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-notify-"));
  process.env.BLOB_STORE_DIR = dir;
  return dir;
}

describe("account-scoped stores", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await isolatedStore();
    delete process.env.MULTI_ACCOUNT;
    delete process.env.AGENT_API_TOKEN;
    resetRuntimeEnvCache();
  });

  afterEach(async () => {
    delete process.env.BLOB_STORE_DIR;
    delete process.env.MULTI_ACCOUNT;
    delete process.env.AGENT_API_TOKEN;
    resetRuntimeEnvCache();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("keeps solo mode until an account exists or the flag is on", async () => {
    assert.equal(await resolveAppMode(), "solo");
    assert.equal(await hasAnyAccount(), false);
    process.env.MULTI_ACCOUNT = "1";
    resetRuntimeEnvCache();
    assert.equal(await resolveAppMode(), "multi");
  });

  it("isolates devices, inbox, and tokens between accounts", async () => {
    await putAccount({
      id: "acct-a",
      email: "a@example.com",
      passwordHash: "x",
      createdAt: "2026-09-08T00:00:00.000Z",
    });
    await putAccount({
      id: "acct-b",
      email: "b@example.com",
      passwordHash: "y",
      createdAt: "2026-09-08T00:00:00.000Z",
    });

    await upsertDeviceFromSubscription(
      "acct-a",
      {
        endpoint: "https://push.example/a",
        keys: { p256dh: "p256dh-aaaaaaaa", auth: "auth-aaa" },
      },
    );
    await upsertDeviceFromSubscription(
      "acct-b",
      {
        endpoint: "https://push.example/b",
        keys: { p256dh: "p256dh-bbbbbbbb", auth: "auth-bbb" },
      },
      { topics: ["deploys"] },
    );

    await putAccountInboxItem("acct-a", {
      id: "n1",
      createdAt: "2026-09-08T01:00:00.000Z",
      title: "A only",
    });
    await putAccountInboxItem("acct-b", {
      id: "n2",
      createdAt: "2026-09-08T01:00:00.000Z",
      title: "B only",
      topic: "deploys",
    });

    const tokenA = await createAgentToken("acct-a", "A token");
    const tokenB = await createAgentToken("acct-b", "B token");

    const devicesA = await listDevices("acct-a");
    const devicesB = await listDevices("acct-b");
    assert.equal(devicesA.length, 1);
    assert.equal(devicesB.length, 1);
    assert.equal(devicesA[0]?.endpoint, "https://push.example/a");
    assert.deepEqual(devicesB[0]?.topics, ["deploys"]);

    assert.equal((await listAccountInboxItems("acct-a")).map((item) => item.id).join(","), "n1");
    assert.equal((await listAccountInboxItems("acct-b")).map((item) => item.id).join(","), "n2");
    assert.equal((await getAccountInboxItem("acct-a", "n2")), null);
    assert.equal((await listAccountInboxItems("acct-b", { topic: "deploys" }))[0]?.id, "n2");
    assert.equal((await listAccountInboxItems("acct-b", { topic: "alerts" })).length, 0);

    assert.equal(await lookupTokenAccount(hashToken(tokenA.token)), "acct-a");
    assert.equal(await lookupTokenAccount(hashToken(tokenB.token)), "acct-b");
    assert.equal(await lookupTokenAccount(hashToken("nope")), null);
    assert.equal(await resolveAppMode(), "multi");
  });

  it("fans out no-topic notifies and filters named topics", async () => {
    await upsertDeviceFromSubscription(
      "acct-a",
      {
        endpoint: "https://push.example/all",
        keys: { p256dh: "p256dh-alllllllll", auth: "auth-all" },
      },
      { topics: ALL_TOPICS },
    );
    await upsertDeviceFromSubscription(
      "acct-a",
      {
        endpoint: "https://push.example/deploys",
        keys: { p256dh: "p256dh-deploysss", auth: "auth-dep" },
      },
      { topics: ["deploys"] },
    );
    await upsertDeviceFromSubscription(
      "acct-a",
      {
        endpoint: "https://push.example/muted",
        keys: { p256dh: "p256dh-muteddddd", auth: "auth-mut" },
      },
      { topics: [] },
    );

    const noTopic = await devicesForTopic("acct-a");
    assert.equal(noTopic.length, 3);

    const deploys = await devicesForTopic("acct-a", "deploys");
    assert.deepEqual(
      deploys.map((device) => device.endpoint).sort(),
      ["https://push.example/all", "https://push.example/deploys"],
    );

    const alerts = await devicesForTopic("acct-a", "alerts");
    assert.deepEqual(
      alerts.map((device) => device.endpoint),
      ["https://push.example/all"],
    );
  });

  it("claims legacy subscriptions and maps AGENT_API_TOKEN", async () => {
    process.env.AGENT_API_TOKEN = "legacy-site-token";
    resetRuntimeEnvCache();
    await putAccount({
      id: "acct-a",
      email: "a@example.com",
      passwordHash: "x",
      createdAt: "2026-09-08T00:00:00.000Z",
    });
    await putSubscription({
      endpoint: "https://push.example/legacy",
      keys: { p256dh: "p256dh-legacyyyy", auth: "auth-leg" },
      createdAt: "2026-09-07T00:00:00.000Z",
      userAgent: "iPhone",
    });

    const result = await claimLegacySite("acct-a");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.devices, 1);
    assert.equal(result.mappedLegacyToken, true);
    const devices = await listDevices("acct-a");
    assert.equal(devices[0]?.endpoint, "https://push.example/legacy");
    assert.equal(devices[0]?.topics, ALL_TOPICS);
    assert.equal(await lookupTokenAccount(hashToken("legacy-site-token")), "acct-a");
  });
});
