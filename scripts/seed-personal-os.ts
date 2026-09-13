import { loadLocalEnv } from "../server/env.ts";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || "43177";
const SITE = (process.env.SITE_URL || `http://${HOST}:${PORT}`).replace(/\/$/, "");

await loadLocalEnv();

if (!process.env.PERSONAL_OS_ALLOW_SEED) {
  console.error("Refusing to seed: set PERSONAL_OS_ALLOW_SEED=1 for local/preview only.");
  process.exit(1);
}

const secret = process.env.OWNER_SETUP_SECRET ?? "";
const res = await fetch(`${SITE}/api/personal-os/seed`, {
  method: "POST",
  headers: secret ? { "X-Owner-Secret": secret } : {},
});
const data = (await res.json()) as { ok?: boolean; stored?: number; error?: string; warning?: string };
if (!res.ok) {
  console.error(`Seed failed (${res.status}):`, data.error ?? data);
  process.exit(1);
}
console.log("DEV-ONLY sample stored:", data.stored, data.warning ?? "");
