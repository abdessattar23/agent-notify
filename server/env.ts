import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import webpush from "web-push";

export async function loadLocalEnv(): Promise<void> {
  await applyDotEnv(".env");
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
    return;
  }
  const generated = await readOrCreateLocalKeys();
  process.env.VAPID_PUBLIC_KEY ??= generated.publicKey;
  process.env.VAPID_PRIVATE_KEY ??= generated.privateKey;
  process.env.VAPID_SUBJECT ??= generated.subject;
  process.env.AGENT_API_TOKEN ??= generated.agentToken;
  console.log("Using generated local VAPID keys in .data/local-env.json (not for production).");
}

async function applyDotEnv(path: string): Promise<void> {
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional in local preview.
  }
}

async function readOrCreateLocalKeys(): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
  agentToken: string;
}> {
  const path = join(process.cwd(), ".data", "local-env.json");
  try {
    return JSON.parse(await readFile(path, "utf8")) as {
      publicKey: string;
      privateKey: string;
      subject: string;
      agentToken: string;
    };
  } catch {
    const keys = webpush.generateVAPIDKeys();
    const generated = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:owner@localhost",
      agentToken: Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url"),
    };
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    await writeFile(path, JSON.stringify(generated, null, 2));
    return generated;
  }
}
