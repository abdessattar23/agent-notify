---
name: agent-notify
description: Send rich Web Push notifications to the owner iPhone via Agent Notify (tap-actions, inbox, show_box).
---

# Agent Notify

Ping the owner with a user-visible Web Push on their Home Screen PWA.

## Setup

- AGENT_NOTIFY_SITE — e.g. https://agent-notify.netlify.app
- AGENT_API_TOKEN — bearer token from Netlify env

Or use mcp/ with the same env vars.

## Notify

POST $AGENT_NOTIFY_SITE/v1/notify with JSON title/body/default_action/actions/data.

Action types: open_app, link, inbox, show_box, copy (max 3 buttons).
Prefer show_box instead of inventing deep links.

See AGENT.md for the full contract.

## show_box honesty

Do not invent Grok Bot deep links. The /go/box page tells the owner to open Grok Bot, pick the agent, then open computer preview. Pass optional agent and hint query fields via the action.
