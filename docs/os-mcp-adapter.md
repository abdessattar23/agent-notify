# Personal OS MCP adapter (disabled by default)

Narrow Agent Notify maintainer surface. This is **not** the Personal OS dashboard UI and it is **not** enabled in production by default.

- **Do not put secrets in git.**
- **Do not deploy this adapter to production** unless an owner explicitly sets the env flags on their own site.
- **Do not create OAuth, purchase, or connect MCP for anyone else.**
- Live Web Push for attention/approval is a **second** gate and stays **off** unless set.

## Enable flags

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_NOTIFY_OS_ADAPTER` | unset / false | Master switch. Tools are omitted and `/api/os-adapter` returns `403 os_adapter_disabled`. |
| `AGENT_NOTIFY_OS_LIVE_PUSH` | unset / false | If the adapter is on, still **dry-run / store-only** unless this is `1`/`true`/`yes`/`on`. |
| `AGENT_NOTIFY_OS_BOTS` | empty | Allowlist `botId:token,other:token`. Bearer must match the token for `botId`. |
| `AGENT_NOTIFY_OS_BOT_TOKEN` | — | MCP client bearer (falls back to `AGENT_API_TOKEN`). |
| `AGENT_NOTIFY_OS_REPLAY_WINDOW_SEC` | `300` | Timestamp + nonce replay window (5 minutes). |
| `AGENT_NOTIFY_OS_RATE_LIMIT_PER_HOUR` | `20` | Per-bot UTC hour cap. |
| `AGENT_NOTIFY_SITE` / `SITE_URL` | existing site | **Only** allowed destination. Tools have no URL/recipient fields. |

Truthy flag values: `1`, `true`, `yes`, `on` (any case). Everything else is off.

## Tools (exactly four, only when enabled)

Existing `agent_notify` is unchanged and separate.

1. `publish_dashboard_event`
2. `request_user_attention`
3. `request_approval`
4. `acknowledge_decision`

When the adapter is disabled they are omitted from MCP `tools/list` and `tools/call` hard-refuses with `os_adapter_disabled`.

## Common fields (all four)

| Field | Rules |
| --- | --- |
| `idempotencyKey` | required, 8–128, token-safe. Repeat returns the stored result. |
| `botId` | required, lowercase allowlisted id. Must exist in `AGENT_NOTIFY_OS_BOTS`. |
| `timestamp` | required UTC ISO-8601 (`…Z`). Must fall inside the replay window. |
| `nonce` | required, 8–128, token-safe. Reuse inside the window is `409 replay_detected`. |
| `summary` | required, 1–200, sanitized. No URLs, emails, CV text, or company markers. |

Unknown fields are rejected. Nested objects (`metricDelta`, `options[]`) also reject extras.

## Tool-specific fields

**publish_dashboard_event**

- `area`: `otel` \| `cfp` \| `jobs` \| `talks` \| `missions` \| `personal-ops`
- `status`: `info` \| `success` \| `warning` \| `blocked` \| `failed`
- `title` (≤120)
- optional `impact`, `nextAction` (≤200)
- optional `decisionNeeded`, `approvalNeeded` (booleans)
- optional `metricDelta`: `{ metric: <area enum>, delta: number }` — outcome KPI deltas only; vanity names like `impressions` are rejected

**request_user_attention**

- `reason`: `deadline` \| `failure` \| `stale` \| `high_value` \| `other`
- `urgency`: `low` \| `normal` \| `high`

**request_approval**

- `decisionId`
- `options`: 1–5 items of `{ id, label }` only
- optional `expiresAt` (UTC ISO-8601)

**acknowledge_decision**

- `decisionId`
- `choice`: must match a stored option `id` **or** an allowlisted choice (`approve`, `reject`, `defer`, `ack`)
- optional `note` (≤200)

## What tools must not accept

No arbitrary `url` / `recipient` / HTTP method or path / shell / filesystem / database / credential fields. Destination is the configured Agent Notify site only.

Payloads that look like Sofrecom, Orange Business / internal GitLab, Mercury, Cloud Foundry, corporate accounts, email bodies, or CV contents are rejected.

## Threat model (summary)

| Threat | Control |
| --- | --- |
| Accidental enable / public bots | Deny by default; MCP omits tools; API 403 |
| Stolen or guessed token | Per-bot bearer allowlist; SHA-256 + timing-safe compare (same as `netlify/lib/auth.ts`) |
| Replay / double-submit | Required timestamp + nonce (300s window) and required idempotency keys |
| Abuse volume | Per-bot hourly rate limit (default 20) |
| Data exfil via tool args | Strict schemas; forbidden keys; no destination fields |
| Secret / PII retention | Redacted audit (metadata + lengths only; never tokens, bodies, CV, company text) |
| Unwanted lock-screen noise | Live Web Push separately gated; default dry-run / store-only |
| Cross-store bleed | Dedicated `os-adapter` blob store (not inbox / subscriptions / tokens) |
| Company / corporate use | Content reject list; this adapter is personal-ops only |

Replay window: **300 seconds** (`AGENT_NOTIFY_OS_REPLAY_WINDOW_SEC`). A timestamp older or newer than that window is `timestamp_out_of_window`. A reused nonce is `replay_detected`.

## Storage

Accepted events, idempotency receipts, nonces, per-bot rate windows, decision option sets, and redacted audit rows live in the **`os-adapter`** blob store (file-backed under `.data/blobs/os-adapter` in local preview).

Audit records keep `botId`, `tool`, `outcome`, error codes, `summaryLength`, and non-sensitive field names. They do **not** store summaries, notes, tokens, or email/CV text.

## How to test (local only)

```bash
npm test
npm run typecheck
```

Covered: disable-default, schemas, auth, replay/idempotency, per-bot rate limit, redaction, company/forbidden content, no arbitrary URL params, MCP list/refuse.

Optional local dry-run (still not a production deploy):

```bash
export AGENT_NOTIFY_OS_ADAPTER=true
export AGENT_NOTIFY_OS_BOTS="personal-ops:local-dev-only-token"
# leave AGENT_NOTIFY_OS_LIVE_PUSH unset
npm run dev
curl -sS -X POST http://127.0.0.1:43177/api/os-adapter \
  -H "Authorization: Bearer local-dev-only-token" \
  -H "Content-Type: application/json" \
  -d '{
    "tool":"request_user_attention",
    "idempotencyKey":"idem-dev-001",
    "botId":"personal-ops",
    "timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'",
    "nonce":"nonce-dev-001",
    "summary":"job poller stale",
    "reason":"stale",
    "urgency":"normal"
  }'
```

Expect `livePush: "dry_run"` unless `AGENT_NOTIFY_OS_LIVE_PUSH` is explicitly enabled.
