# Agent Notify — agent contract

Use this document when an AI agent should ping the owner. This is a **single-user** inbox. Do not scrape the PWA. Do not send silent or empty pushes.

## Endpoint

`POST {SITE}/v1/notify`

`SITE` is the Netlify origin, for example `https://agent-notify.netlify.app`.

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
  "url": "optional legacy relative/absolute URL (maps to a link default_action)",
  "tag": "optional string; reused tags replace the previous notification",
  "image": "optional image URL shown on the notification",
  "badge_count": "optional integer 0–9999 → Declarative app_badge",
  "default_action": {
    "type": "open_app | link | inbox | show_box | copy",
    "title": "optional for default_action",
    "url": "required for link",
    "text": "required for copy",
    "id": "optional inbox id override",
    "agent": "optional show_box agent label",
    "hint": "optional show_box hint",
    "message": "optional show_box message",
    "emoji": "optional show_box emoji (<=32)",
    "subtitle": "optional show_box subtitle (<=200)",
    "bg": "optional sanitized CSS background (<=280)",
    "color": "optional sanitized CSS color (<=64)"
  },
  "actions": [
    {
      "type": "open_app | link | inbox | show_box | copy",
      "title": "button label, required, max 3 actions",
      "url": "required for link",
      "text": "required for copy",
      "agent": "optional",
      "hint": "optional",
      "message": "optional",
      "emoji": "optional",
      "subtitle": "optional",
      "bg": "optional",
      "color": "optional"
    }
  ],
  "data": { "any": "json object, serialized <= 8000 chars" }
}
```

Every rich tap is routed through the PWA:

| Action | Opens |
| --- | --- |
| `open_app` | `/go/app` → home |
| `link` | `/go/link?url=…` |
| `inbox` | `/inbox/:id` |
| `show_box` | `/go/box` — bare: honesty/instructions; with `emoji`/`subtitle`/`message`/`bg`/`color`: agent-styled page |
| `copy` | `/go/copy` clipboard helper |

If `default_action` is omitted and `url` is set, the default tap is a `link`. Otherwise the default tap opens the stored inbox item.

The server wraps this in Declarative Web Push (`web_push: 8030`, `mutable: true`, `silent: false`) with `navigate`, optional `image` / `app_badge`, and `notification.actions` navigate URLs. Each notify is persisted for `GET /api/inbox`.

## Example

```bash
curl -sS -X POST "$SITE/v1/notify" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Deploy ready",
    "body":"Preview is up",
    "badge_count":1,
    "default_action":{"type":"show_box","agent":"deploy-bot","hint":"Open computer preview"},
    "actions":[
      {"type":"copy","title":"Copy URL","text":"https://preview.example"},
      {"type":"link","title":"Open PR","url":"https://github.com/example/pr/1"}
    ],
    "data":{"agent":"deploy-bot"}
  }'
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

Success body includes `id` (inbox item id), `delivered`, `failed`, `pruned`, `errors`.

## Rate limit

Default **30 requests per UTC hour** per site (`RATE_LIMIT_PER_HOUR`).

## When to notify

Good: build failed, long job finished, human-needed approval, “look at my box”.

Bad: heartbeats, debug traces, streaming tokens.

If `409 no_subscriptions`, tell the owner to Enable notifications. Do not tight-loop.

## Other endpoints

Agents only need `/v1/notify`. Owner PWA uses `/api/subscribe`, `/api/ping`, `/api/inbox`, `/api/vapid-public-key`.

Personal OS ledger bots use `POST /api/personal-os/events` with a per-bot bearer token (not `AGENT_API_TOKEN`). See [docs/personal-os.md](./docs/personal-os.md). Do not scrape any UI. Do not send routine heartbeats as pushes.
