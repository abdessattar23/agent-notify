# Agent Notify — agent contract

Use this document when an AI agent should ping the owner. This is a **single-user** inbox. Do not scrape the PWA. Do not send silent or empty pushes.

## Endpoint

`POST {SITE}/v1/notify`

`SITE` is the Netlify origin, for example `https://example.netlify.app`.

## Authentication

```
Authorization: Bearer $AGENT_API_TOKEN
Content-Type: application/json
```

The token is a Netlify environment variable. Never put it in the PWA, git, or a chat log. If the server returns `401` with `"unauthorized"` or `"agent_token_unconfigured"`, stop and tell the owner.

## Body

```json
{
  "title": "string, required, <= 120 chars",
  "body": "optional string, <= 2000 chars",
  "url": "optional relative or absolute URL opened on tap",
  "tag": "optional string; reused tags replace the previous notification"
}
```

The server wraps this in Declarative Web Push:

```json
{
  "web_push": 8030,
  "mutable": true,
  "notification": {
    "title": "…",
    "body": "…",
    "navigate": "https://…",
    "silent": false
  }
}
```

Always user-visible. There is no silent-push flag you can set.

## Example

```bash
curl -sS -X POST "$SITE/v1/notify" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Deploy ready","body":"Preview is up","url":"/"}'
```

## Responses

| Status | Meaning |
| --- | --- |
| `200` | Delivered to every stored subscription |
| `207` | Partial: some devices failed; others were pruned |
| `400` | Invalid JSON or missing `title` |
| `401` | Bad or missing bearer token |
| `409` | Owner has not enabled notifications yet |
| `429` | Hourly rate limit (default 30). Honor `Retry-After` |
| `503` | VAPID or agent token missing on the site |

Success body:

```json
{
  "ok": true,
  "delivered": 1,
  "failed": 0,
  "pruned": 0,
  "errors": []
}
```

## Rate limit

Default **30 requests per UTC hour** per site (`RATE_LIMIT_PER_HOUR`). Bursting will get `429`. Batch status into one notification when you can.

## When to notify

Good: build failed, long job finished, calendar reminder, human-needed approval.

Bad: heartbeats, debug traces, every token of a stream, anything the owner did not ask to be woken for.

If `409 no_subscriptions`, tell the owner to open the Home Screen app and tap **Enable notifications**. Do not retry in a tight loop.

## Other endpoints

Agents only need `/v1/notify`. The PWA uses `/api/subscribe`, `/api/ping`, and `/api/vapid-public-key`. Those are owner-facing.
