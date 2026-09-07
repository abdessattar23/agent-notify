---
name: Agent Notify
description: >-
  Use when an agent should Web Push the owner's iPhone via Agent Notify (build
  failed, job finished, approval needed) — prefer the agent-notify MCP notify
  tool; fall back to POST /v1/notify.
---
# Agent Notify

Ping the owner's iPhone with a **user-visible** Web Push. Single-user inbox. Do not scrape the PWA. No silent pushes. No heartbeats or debug spam.

## Prefer MCP

If the `agent-notify` connector is available, call its tools:

1. `notify` — `title` (required), optional `body`, `url`, `tag`
2. `health` — check `vapidConfigured`, `agentTokenConfigured`, `subscriptionCount`

Do **not** put `AGENT_API_TOKEN` in chat, commits, or the PWA.

## Curl fallback

```bash
export SITE="${AGENT_NOTIFY_SITE:-https://agent-notify.netlify.app}"
# AGENT_API_TOKEN from env / Netlify site env — never hardcode in the skill or chat

curl -sS -X POST "$SITE/v1/notify" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Build failed","body":"CI on main is red","url":"/"}'
```

Body fields:

| Field | Rules |
| --- | --- |
| `title` | required, ≤ 120 chars |
| `body` | optional, ≤ 2000 chars |
| `url` | optional relative or absolute URL on tap |
| `tag` | optional; same tag replaces the previous notification |

## Responses

| Status | Meaning |
| --- | --- |
| `200` | Delivered to every stored subscription |
| `207` | Partial delivery / some pruned |
| `400` | Bad JSON / missing title |
| `401` | Bad or missing bearer token — stop and tell the owner |
| `409` | No subscriptions — tell owner to open the Home Screen app and Enable notifications |
| `429` | Hourly rate limit (default 30). Honor `Retry-After`; batch instead of bursting |
| `503` | VAPID or agent token missing on the site |

## When to notify

Good: build failed, long job finished, human approval needed, calendar reminder.

Bad: heartbeats, every stream token, chatty progress, anything the owner did not ask to be woken for.

If `409 no_subscriptions`, tell the owner once. Do not retry in a tight loop.

## Owner setup (if push is broken)

1. Open the site in **Safari**
2. Share → **Add to Home Screen**
3. Launch the icon (Standalone)
4. Tap **Enable notifications** → Allow
5. Test ping

Agents only need `/v1/notify`. Subscribe/ping/vapid endpoints are owner-facing.
