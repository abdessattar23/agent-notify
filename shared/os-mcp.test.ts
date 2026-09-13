import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpEntry = join(root, "mcp/src/index.js");

type Rpc = {
  jsonrpc: "2.0";
  id: number;
  result?: { tools?: Array<{ name: string }> };
  error?: { code: number; message: string };
};

async function withMcp(
  extraEnv: NodeJS.ProcessEnv,
  run: (rpc: (method: string, params?: unknown) => Promise<Rpc>) => Promise<void>,
): Promise<void> {
  const child = spawn(process.execPath, [mcpEntry], {
    cwd: root,
    env: {
      ...process.env,
      AGENT_NOTIFY_SITE: "https://example.com",
      AGENT_API_TOKEN: "notify-token",
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, (msg: Rpc) => void>();
  const rl = createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line) as Rpc;
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    } catch {
      // ignore non-JSON
    }
  });

  let nextId = 1;
  const rpc = (method: string, params?: unknown) =>
    new Promise<Rpc>((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 4000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

  try {
    await run(rpc);
  } finally {
    rl.close();
    child.kill();
  }
}

describe("os adapter MCP stdio surface", () => {
  it("lists only agent_notify when the adapter is disabled", async () => {
    await withMcp({ AGENT_NOTIFY_OS_ADAPTER: undefined }, async (rpc) => {
      const listed = await rpc("tools/list");
      const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
      assert.deepEqual(names, ["agent_notify"]);
    });
  });

  it("hard-refuses OS tools when disabled", async () => {
    await withMcp({}, async (rpc) => {
      const call = await rpc("tools/call", {
        name: "publish_dashboard_event",
        arguments: { summary: "nope" },
      });
      const message = call.error?.message ?? JSON.stringify(call.result);
      assert.match(String(message), /os_adapter_disabled|Unknown tool|disabled/i);
    });
  });

  it("lists exactly four OS tools plus agent_notify when enabled", async () => {
    await withMcp({ AGENT_NOTIFY_OS_ADAPTER: "true" }, async (rpc) => {
      const listed = await rpc("tools/list");
      const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
      assert.deepEqual(names, [
        "agent_notify",
        "publish_dashboard_event",
        "request_user_attention",
        "request_approval",
        "acknowledge_decision",
      ]);
    });
  });
});
