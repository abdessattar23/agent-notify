#!/usr/bin/env node
/**
 * Agent Notify MCP — sends Web Push to the owner iPhone via POST /v1/notify.
 *
 * Env:
 *   AGENT_NOTIFY_SITE   e.g. https://agent-notify.netlify.app
 *   AGENT_API_TOKEN     bearer token (Netlify AGENT_API_TOKEN)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SITE = (process.env.AGENT_NOTIFY_SITE || process.env.SITE || "").replace(/\/$/, "");
const TOKEN = (process.env.AGENT_API_TOKEN || "").trim();

function requireConfig() {
  if (!SITE) {
    throw new Error("AGENT_NOTIFY_SITE is not set (e.g. https://agent-notify.netlify.app)");
  }
  if (!TOKEN) {
    throw new Error("AGENT_API_TOKEN is not set");
  }
}

async function postNotify(body) {
  requireConfig();
  const res = await fetch(`${SITE}/v1/notify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const server = new McpServer({
  name: "agent-notify",
  version: "1.0.0",
});

server.tool(
  "notify",
  "Send a user-visible Web Push to the owner iPhone via Agent Notify. Use for build failures, finished jobs, or approvals — not heartbeats. Rate limit ~30/hour.",
  {
    title: z.string().min(1).max(120).describe("Notification title"),
    body: z.string().max(2000).optional().describe("Optional body text"),
    url: z.string().max(2000).optional().describe("Optional relative or absolute URL opened on tap"),
    tag: z.string().max(200).optional().describe("Optional tag; same tag replaces the previous notification"),
  },
  async ({ title, body, url, tag }) => {
    const payload = { title };
    if (body !== undefined) payload.body = body;
    if (url !== undefined) payload.url = url;
    if (tag !== undefined) payload.tag = tag;
    try {
      const { status, data } = await postNotify(payload);
      const ok = status === 200 || status === 207;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok, status, site: SITE, ...data }, null, 2),
          },
        ],
        isError: !ok,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  "health",
  "Check Agent Notify site health (vapidConfigured, agentTokenConfigured, subscriptionCount).",
  {},
  async () => {
    try {
      requireConfig();
      const res = await fetch(`${SITE}/api/health`);
      const data = await res.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: res.status, site: SITE, ...data }, null, 2),
          },
        ],
        isError: !res.ok,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
