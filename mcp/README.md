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

**Contract version:** `OS_ADAPTER_SCHEMA_VERSION = "1.0.0"`. All four tools require `schemaVersion: "1.0.0"`. Mismatched or missing versions return `unsupported_schema_version`. Success responses echo `schemaVersion`.

### Field list per tool (v1.0.0)

Common (required): `schemaVersion`, `idempotencyKey`, `botId`, `timestamp`, `nonce`, `summary`.

- `publish_dashboard_event` — `area`, `status`, `title`; optional `impact`, `nextAction`, `decisionNeeded`, `approvalNeeded`, `metricDelta`
- `request_user_attention` — `reason`, `urgency`
- `request_approval` — `decisionId`, `options`; optional `expiresAt`
- `acknowledge_decision` — `decisionId`, `choice`; optional `note`

### Version bump policy

Bump `OS_ADAPTER_SCHEMA_VERSION` in `shared/os-adapter.ts` and `mcp/src/os-adapter.js` together. Patch = docs only (still `1.0.0`). Minor/major = new version string; unknown versions are rejected unless added to the allowlist. Dashboard stubs must use the same constant so the two repos do not drift.

Bot auth: `AGENT_NOTIFY_OS_BOTS=botId:token,…` on the site; MCP sends `AGENT_NOTIFY_OS_BOT_TOKEN` (or `AGENT_API_TOKEN`) as the bearer.

**No secrets in git. Do not deploy this adapter to production by default.**

Full threat model, schemas, replay window (300s), and test notes: [`docs/os-mcp-adapter.md`](../docs/os-mcp-adapter.md).
