import { hasAnyAccount } from "./accounts.ts";
import { getRuntimeEnv } from "./env.ts";

export type AppMode = "solo" | "multi";

export async function resolveAppMode(): Promise<AppMode> {
  const env = getRuntimeEnv();
  if (env.multiAccount) return "multi";
  if (await hasAnyAccount()) return "multi";
  return "solo";
}

export async function isMultiAccountMode(): Promise<boolean> {
  return (await resolveAppMode()) === "multi";
}
