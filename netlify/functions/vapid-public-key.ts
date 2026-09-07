import type { Config, Context } from "@netlify/functions";
import { getRuntimeEnv, vapidConfigured } from "../lib/env.ts";
import { json, methodNotAllowed, optionsResponse } from "../lib/http.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "GET":
      return publicKey();
    default:
      return methodNotAllowed(["GET", "OPTIONS"]);
  }
}

function publicKey(): Response {
  const env = getRuntimeEnv();
  if (!vapidConfigured(env)) {
    return json({ ok: false, error: "vapid_unconfigured" }, 503);
  }
  return json({
    ok: true,
    publicKey: env.vapidPublicKey,
    subject: env.vapidSubject,
  });
}

export const config: Config = {
  path: "/api/vapid-public-key",
  method: ["GET", "OPTIONS"],
};
