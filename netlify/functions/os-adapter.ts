import type { Config, Context } from "@netlify/functions";
import { handleOsAdapterRequest } from "../lib/os-adapter.ts";
import { resolveSiteUrl } from "../lib/env.ts";
import { methodNotAllowed, optionsResponse } from "../lib/http.ts";
import { sendToAllSubscriptions } from "../lib/push.ts";
import { isOsLivePushEnabled } from "../../shared/os-adapter.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  switch (req.method) {
    case "OPTIONS":
      return optionsResponse();
    case "POST":
      return handleOsAdapterRequest(req, {
        origin: resolveSiteUrl(req),
        sendPush: isOsLivePushEnabled()
          ? (input, origin) => sendToAllSubscriptions(input, origin)
          : undefined,
      });
    default:
      return methodNotAllowed(["POST", "OPTIONS"]);
  }
}

export const config: Config = {
  path: "/api/os-adapter",
  method: ["POST", "OPTIONS"],
};
