import { createInterface } from "node:readline";

const SITE = (process.env.AGENT_NOTIFY_SITE || process.env.SITE_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AGENT_API_TOKEN || "";

const TOOLS = [
  {
    name: "agent_notify",
    description:
      "Send a user-visible Web Push to the owner via Agent Notify. Supports tap-actions: open_app, link, inbox, show_box, copy.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", maxLength: 120 },
        body: { type: "string", maxLength: 2000 },
        url: { type: "string" },
        tag: { type: "string" },
        image: { type: "string" },
        badge_count: { type: "integer", minimum: 0, maximum: 9999 },
        default_action: { type: "object" },
        actions: {
          type: "array",
          maxItems: 3,
          items: { type: "object" },
        },
        data: { type: "object" },
      },
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function notify(args) {
  if (!SITE) {
    throw new Error("AGENT_NOTIFY_SITE (or SITE_URL) is not set");
  }
  if (!TOKEN) {
    throw new Error("AGENT_API_TOKEN is not set");
  }
  const res = await fetch(`${SITE}/v1/notify`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `notify failed (${res.status})`);
  }
  return data;
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "agent-notify", version: "1.0.0" },
        },
      });
      return;
    }
    if (method === "notifications/initialized") {
      return;
    }
    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    }
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (name !== "agent_notify") {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        });
        return;
      }
      const result = await notify(args);
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      });
      return;
    }
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: message }],
          isError: true,
        },
      });
    }
  }
});
