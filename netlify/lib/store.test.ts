import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCanonicalProductionHost,
  isDraftPreviewHost,
  personalOsStoreMode,
} from "./store.ts";

describe("Personal OS host classification", () => {
  it("treats only the canonical production hostname as production", () => {
    assert.equal(isCanonicalProductionHost("https://agent-notify.netlify.app"), true);
    assert.equal(isCanonicalProductionHost("https://agent-notify.netlify.app/"), true);
    assert.equal(isCanonicalProductionHost("agent-notify.netlify.app"), true);
    assert.equal(isCanonicalProductionHost("https://deploy-preview-3--agent-notify.netlify.app"), false);
    assert.equal(isCanonicalProductionHost("https://abc123--agent-notify.netlify.app"), false);
    assert.equal(isCanonicalProductionHost("http://127.0.0.1:43177"), false);
  });

  it("detects Netlify draft and deploy-preview hostnames", () => {
    assert.equal(isDraftPreviewHost("https://deploy-preview-9--agent-notify.netlify.app"), true);
    assert.equal(isDraftPreviewHost("https://61d1aa5d11d1aa5d11d1aa5d--agent-notify.netlify.app"), true);
    assert.equal(isDraftPreviewHost("https://agent-notify.netlify.app"), false);
    assert.equal(isDraftPreviewHost("http://127.0.0.1:43177"), false);
  });
});

describe("Personal OS store scope", () => {
  it("uses a deploy-scoped store on unpublished / CLI draft deploys", () => {
    assert.equal(
      personalOsStoreMode({
        deployPublished: false,
        siteUrl: "https://agent-notify.netlify.app",
        requestUrl: "https://agent-notify.netlify.app",
      }),
      "deploy",
    );
  });

  it("uses a deploy-scoped store for draft hostnames even when CONTEXT/URL look like production", () => {
    assert.equal(
      personalOsStoreMode({
        requestUrl: "https://deadbeef--agent-notify.netlify.app",
        siteUrl: "https://agent-notify.netlify.app",
        deployUrl: "https://deadbeef--agent-notify.netlify.app",
        deployPublished: undefined,
      }),
      "deploy",
    );
    assert.equal(
      personalOsStoreMode({
        deployUrl: "https://deploy-preview-3--agent-notify.netlify.app",
        siteUrl: "https://agent-notify.netlify.app",
      }),
      "deploy",
    );
  });

  it("uses the site-scoped ledger only for the published production hostname", () => {
    assert.equal(
      personalOsStoreMode({
        requestUrl: "https://agent-notify.netlify.app/api/personal-os/events",
        siteUrl: "https://agent-notify.netlify.app",
        deployPublished: true,
      }),
      "site",
    );
  });

  it("defaults to deploy-scoped when production URL is inherited but the deploy is not proven published", () => {
    assert.equal(
      personalOsStoreMode({
        siteUrl: "https://agent-notify.netlify.app",
      }),
      "deploy",
    );
  });
});
