# Agent Notify

Personal [Netlify](https://www.netlify.com/) PWA + API. Authenticated AI agents `POST /v1/notify`; you get a Web Push on the iPhone Home Screen app (iOS 16.4+ and iOS 26).

**Live:** https://agent-notify.netlify.app

This is a single-user MVP. Hosting is **Netlify static files + Netlify Functions**. Subscriptions and rate-limit/token usage live in **Netlify Blobs**. There are no Cloudflare Workers.

On iPhone, **Add to Home Screen is required**. Safari tabs cannot receive Web Push. Permission is requested only from a user gesture. Payloads use [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) (`web_push: 8030`) so iOS can show a notification even if the service worker was evicted. Silent push is never sent (`userVisibleOnly` + `silent: false`).

## What you get

- PWA: install instructions, standalone detection, Enable notifications, status, test ping, inbox + `/go/*` tap router, `display: standalone` manifest + icons, service worker
- API: health, VAPID public key, subscribe / unsubscribe, authenticated notify with action buttons, inbox Blobs store, hourly rate limit, prune of dead subscriptions (404/410)
- Local preview server that uses the same function handlers (file-backed blobs when not on Netlify)
- MCP server + skill under `mcp/` and `skills/agent-notify/` for agents

## Deploy on Netlify

1. Create a Netlify site from this repo (or `netlify init` / drag-and-drop after `npm run build`).
2. Generate VAPID keys on your machine:

```bash
npm install
npm run generate:vapid
```

If `.env` already exists, the command prints keys instead of overwriting.

3. In **Site configuration → Environment variables**, set:

| Variable | Required | Notes |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | yes | From `web-push` / `npm run generate:vapid` |
| `VAPID_PRIVATE_KEY` | yes | Keep secret |
| `VAPID_SUBJECT` | yes | `mailto:you@example.com` or `https://your-site.netlify.app` |
| `AGENT_API_TOKEN` | yes | Long random bearer token for agents |
| `OWNER_SETUP_SECRET` | no | If set, the PWA must send it as `X-Owner-Secret` to subscribe or ping |
| `SITE_URL` | no | Defaults to Netlify `URL` |
| `RATE_LIMIT_PER_HOUR` | no | Default `30` |

4. Build settings are in `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node 22

5. Deploy. Confirm `GET https://YOUR_SITE/api/health` returns `"ok": true` and `"vapidConfigured": true`.

Blobs are provisioned automatically for Functions. No extra database.

## iPhone setup

1. Open the deployed HTTPS URL in **Safari** (not Chrome, not an in-app browser).
2. Tap **Share → Add to Home Screen**. Keep the name **Agent Notify**.
3. Open the icon (standalone). The status row should say **Standalone**.
4. If you set `OWNER_SETUP_SECRET`, enter it on the page.
5. Tap **Enable notifications** and allow the system prompt.
6. Tap **Test ping**. You should see a lock-screen notification.

Requirements: iOS 16.4 or later (including 26). Focus / Low Power can delay delivery. There is no silent push and no background data sync.

## Agent curl

```bash
export SITE="https://YOUR_SITE.netlify.app"
export AGENT_API_TOKEN="the-token-from-netlify-env"

curl -sS -X POST "$SITE/v1/notify" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Build failed","body":"CI on main is red","url":"/"}'
```

Agents should treat this as a fire-and-forget user-visible ping. See [AGENT.md](./AGENT.md) for the contract.

## Local development

```bash
npm install
npm run generate:icons   # already committed; rerun if you change the icon script
npm run generate:vapid   # writes .env if missing
npm run dev              # http://127.0.0.1:43177
```

`npm run dev` serves the Vite app and the same TypeScript Netlify Functions. Without Netlify credentials, blobs are stored under `.data/blobs`.

```bash
npm test
npm run typecheck
npm run build
npm run preview          # static dist + API on :43177
```

Chrome on localhost can subscribe and receive push. An iPhone still needs the Netlify HTTPS origin.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | none | Liveness + config flags |
| `GET` | `/api/vapid-public-key` | none | Public VAPID key for `PushManager.subscribe` |
| `POST` | `/api/subscribe` | `X-Owner-Secret` if configured | Store a push subscription in Blobs |
| `DELETE` | `/api/subscribe` | `X-Owner-Secret` if configured | Remove a subscription |
| `POST` | `/api/ping` | `X-Owner-Secret` if configured | Owner test push |
| `GET` | `/api/inbox` / `/api/inbox/:id` | `X-Owner-Secret` if configured | Owner inbox |
| `POST` | `/api/personal-os/events` | per-bot bearer (`PERSONAL_OS_BOT_TOKENS` / `PERSONAL_OS_TOKEN_<BOT>`) | Idempotent Personal OS ingest |
| `GET` | `/api/personal-os/dashboard` | `X-Owner-Secret` if configured | Personal OS aggregation |
| `POST` | `/api/personal-os/seed` | owner + `PERSONAL_OS_ALLOW_SEED` (blocked in production) | DEV-ONLY sample events |
| `POST` | `/v1/notify` | `Authorization: Bearer $AGENT_API_TOKEN` | Agent push (rate limited) |

Notify body (rich tap-actions):

```json
{
  "title": "Required, max 120 chars",
  "body": "Optional",
  "url": "legacy optional URL → link default_action",
  "tag": "optional-dedupe-key",
  "image": "optional",
  "badge_count": 1,
  "default_action": {
    "type": "show_box",
    "title": "Ready",
    "emoji": "✨",
    "message": "Preview is up",
    "subtitle": "optional caption",
    "bg": "linear-gradient(180deg, #10211c 0%, #1a3a32 100%)",
    "color": "#f5f5f4",
    "hint": "Open computer preview"
  },
  "actions": [
    { "type": "copy", "title": "Copy", "text": "…" },
    { "type": "link", "title": "Open", "url": "https://…" }
  ],
  "data": { "agent": "optional" }
}
```

Action types: `open_app` | `link` | `inbox` | `show_box` | `copy` (max 3 buttons). For `show_box`, optional `emoji` / `subtitle` / `message` / `bg` / `color` render a custom styled page; omit them for the default computer-preview instructions. `bg` and `color` are sanitized CSS (no `url()` / `expression` / `;`). Taps land on `/go/*` or `/inbox/:id`. The server always sends Declarative Web Push JSON (`web_push: 8030`, `mutable: true`, `silent: false`) with `navigate` + `notification.actions`. Dead endpoints (404/410) are deleted from Blobs. Each notify is stored for `GET /api/inbox`.

## Layout

```
netlify/functions/   TypeScript Functions 2.0 handlers
netlify/lib/         Blobs, VAPID, auth, rate limit, inbox, Personal OS
public/sw.js         Push + action clicks + offline shell
src/                 PWA UI (home, inbox, /os, /go router)
shared/              Payload validation used by Functions
docs/personal-os.md  Personal OS architecture, privacy, seed
mcp/                 MCP server for notify
skills/agent-notify/ Agent skill docs
```

Personal OS (`/os`) is a draft owner dashboard for sanitized bot-published events. See [docs/personal-os.md](./docs/personal-os.md). Draft preview only; do not use production secrets.
