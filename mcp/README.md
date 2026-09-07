# Agent Notify MCP

Local stdio MCP server for the [Agent Notify](https://agent-notify.netlify.app) PWA.

## Tools

| Tool | Purpose |
| --- | --- |
| `notify` | `POST /v1/notify` — title, optional body/url/tag |
| `health` | `GET /api/health` |

## Setup

```bash
cd mcp
npm install
export AGENT_NOTIFY_SITE="https://agent-notify.netlify.app"
export AGENT_API_TOKEN="your-netlify-AGENT_API_TOKEN"
node src/index.js
```

Never commit the token.

## Cursor mcp.json

```json
{
  "mcpServers": {
    "agent-notify": {
      "command": "node",
      "args": ["/ABS/PATH/TO/agent-notify/mcp/src/index.js"],
      "env": {
        "AGENT_NOTIFY_SITE": "https://agent-notify.netlify.app",
        "AGENT_API_TOKEN": "${AGENT_API_TOKEN}"
      }
    }
  }
}
```

## Skill

See [`../skills/agent-notify/SKILL.md`](../skills/agent-notify/SKILL.md).
