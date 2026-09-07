import { writeFile } from "node:fs/promises";
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
const subject = process.env.VAPID_SUBJECT || "mailto:you@example.com";
const token = process.env.AGENT_API_TOKEN || randomToken();

const lines = [
  `VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `VAPID_PRIVATE_KEY=${keys.privateKey}`,
  `VAPID_SUBJECT=${subject}`,
  `AGENT_API_TOKEN=${token}`,
  "",
];

try {
  await writeFile(".env", lines.join("\n"), { flag: "wx" });
  console.log("Wrote .env with a new VAPID key pair and AGENT_API_TOKEN.");
} catch {
  console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
  console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
  console.log("VAPID_SUBJECT=" + subject);
  console.log("\nA .env file already exists. Copy the printed keys into Netlify env vars.");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}
