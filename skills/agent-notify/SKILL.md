---
name: agent-notify
description: Send rich Web Push notifications to the owner iPhone via Agent Notify (tap-actions, inbox, show_box).
---

# Agent Notify

Ping the owner with a user-visible Web Push on their Home Screen PWA.

## Setup

- AGENT_NOTIFY_SITE — e.g. https://agent-notify.netlify.app
- AGENT_API_TOKEN — bearer token from Netlify env (solo) or a per-account token from the Tokens page

Or use mcp/ with the same env vars.

## Notify

POST $AGENT_NOTIFY_SITE/v1/notify with JSON title/body/default_action/actions/data and optional topic.

On multi-account deploys the token selects the account. Omit topic to fan out to every device on that account. `topic: "deploys"` reaches devices subscribed to that topic or devices with all-topics `*`. Alias: POST /v1/t/{topic}.

Action types: open_app, link, inbox, show_box, copy (max 3 buttons).
Prefer show_box instead of inventing deep links.

See AGENT.md for the full contract.

## show_box

Bare `show_box` opens the honesty page (open Grok Bot → agent → computer preview). Pass optional `agent` and `hint`.

To style the box page yourself, set any of `emoji`, `subtitle`, `message`, `bg`, or `color` on the action. That switches to a custom layout (no Grok instructions). `bg` / `color` are sanitized CSS values (hex, rgb/hsl, gradients for bg; no `url()`, `expression`, or `;`).

```json
{
  "title": "Look",
  "default_action": {
    "type": "show_box",
    "title": "Ready",
    "emoji": "✨",
    "message": "Preview is up",
    "subtitle": "tap inbox for details",
    "bg": "linear-gradient(180deg, #10211c 0%, #1a3a32 100%)",
    "color": "#f5f5f4"
  }
}
```
