# Agent Notify MCP

Stdio JSON-RPC server wrapping Agent Notify.

## Default tool

`agent_notify` → `POST {AGENT_NOTIFY_SITE}/v1/notify`

Env: `AGENT_NOTIFY_SITE` (or `SITE_URL`), `AGENT_API_TOKEN`.

See the root README and `AGENT.md`.

## Personal OS adapter (disabled by default)

Four extra tools exist only when `AGENT_NOTIFY_OS_ADAPTER` is explicitly enabled (`1` / `true` / `yes` / `on`):

- `publish_dashboard_event`
- `request_user_attention`
- `request_approval`
- `acknowledge_decision`

When the flag is unset/false (the default):

- they are **omitted** from `tools/list`
- `tools/call` **hard-refuses** with `os_adapter_disabled`

They never accept URL, recipient, HTTP, shell, filesystem, database, or credential fields. The only destination is the server-configured site. Live Web Push for attention/approval requires a **second** flag, `AGENT_NOTIFY_OS_LIVE_PUSH` (also off by default). Store-only / dry-run is the default even after the adapter is enabled.

Bot auth: `AGENT_NOTIFY_OS_BOTS=botId:token,…` on the site; MCP sends `AGENT_NOTIFY_OS_BOT_TOKEN` (or `AGENT_API_TOKEN`) as the bearer.

**No secrets in git. Do not deploy this adapter to production by default.**

Full threat model, schemas, replay window (300s), and test notes: [`docs/os-mcp-adapter.md`](../docs/os-mcp-adapter.md).
