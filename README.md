# Agent Notify

Personal [Netlify](https://www.netlify.com/) PWA + API. Authenticated AI agents `POST /v1/notify`; you get a Web Push on the **same** installable PWA — iPhone Home Screen (primary on iOS), Android Chrome, and desktop Chrome / Edge. There is no native app.

**Live:** https://agent-notify.netlify.app

This started as a single-user MVP and now optionally supports **multiple accounts** with per-account devices, agent tokens, and topics. Hosting is **Netlify static files + Netlify Functions**. Subscriptions and rate-limit/token usage live in **Netlify Blobs**. There are no Cloudflare Workers. Solo deploys that only set `AGENT_API_TOKEN` keep working.

On iPhone, **Add to Home Screen is required**. Safari tabs cannot receive Web Push. Android Chrome and desktop Chromium can receive classic Web Push in a browser tab; installing the PWA is recommended on Android and optional on desktop. Permission is requested only from a user gesture. Payloads use [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) (`web_push: 8030`) so iOS can show a notification even if the service worker was evicted. Chromium clients handle the same payload in `public/sw.js` via the classic `push` + `notificationclick` events. Silent push is never sent (`userVisibleOnly` + `silent: false`).

## What you get

- PWA: platform install hints (iOS / Android / desktop), standalone detection, Enable notifications, status, test ping, inbox + `/go/*` tap router, `display: standalone` manifest + icons, service worker
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
| `AGENT_API_TOKEN` | solo: yes | Long random bearer token for agents. Unused for new tokens after a site is claimed. |
| `OWNER_SETUP_SECRET` | no | Solo only. If set, the PWA must send it as `X-Owner-Secret` to subscribe or ping |
| `SITE_URL` | no | Defaults to Netlify `URL` |
| `RATE_LIMIT_PER_HOUR` | no | Default `30` (per site in solo, per account in multi) |
| `MULTI_ACCOUNT` | no | Set `1` / `true` to enable signup and per-account tokens |
| `SESSION_SECRET` | multi: yes | HMAC secret for the HTTP-only session cookie |
| `INVITE_CODE` | no | If set, signup requires this invite (email optional for one invite-only account) |
| `SIGNUP_RATE_LIMIT_PER_HOUR` | no | Default `5` per client IP |

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

## Android Chrome setup

1. Open the deployed HTTPS URL in **Chrome** (not an in-app browser).
2. Optional but recommended: tap the Chrome menu (**⋮**) → **Install app** or **Add to Home screen**. Keep the name **Agent Notify**.
3. Open the installed app (or stay in the Chrome tab) and tap **Enable notifications**.
4. Tap **Test ping**. You should see a system notification.

Push works from the Chrome tab after permission is granted. Installing the PWA is still recommended so OEM battery savers are less likely to evict the service worker.

## Desktop Chrome / Edge setup

1. Open the deployed HTTPS URL in **Chrome** or **Edge** (Chromium). Desktop Safari is not a verified client.
2. Optional: install from the address-bar install icon if you want a standalone window.
3. Click **Enable notifications** and allow the permission prompt (padlock → Notifications if the icon was blocked).
4. Click **Test ping**.

Chrome on localhost can also subscribe during `npm run dev`. An iPhone still needs the Netlify HTTPS origin.

## Multi-device

One agent token fans out to **every subscribed device** on that account (solo: every stored subscription). Enable the PWA on an iPhone, an Android phone, and a desktop browser — they all receive the same notify unless a device topic filter excludes it.

## Troubleshooting

- **Permission denied:** iOS — delete the Home Screen icon and add it again, then allow the prompt. Android / desktop — site settings → Notifications → Allow (desktop: padlock icon).
- **Android: no notification:** check Chrome notifications are allowed at the OS level. On Samsung / Xiaomi / Oppo / OnePlus, disable battery optimization for Chrome or the installed PWA.
- **iPhone: no notification:** confirm you launched the Home Screen app (not a Safari tab). Focus and Low Power Mode can delay delivery.
- **Desktop: no notification:** OS Focus / Do Not Disturb hides banners. Confirm Chrome/Edge is not set to “quiet”.
- **Action buttons do nothing:** update the service worker (reload the installed app once). Chromium uses `notificationclick`; iOS can also use Declarative Web Push `navigate`.

## Manual Chromium smoke checklist

Use a real Android Chrome device or desktop Chrome/Edge against the deployed HTTPS origin (or `npm run dev` on desktop):

1. [ ] Open the PWA URL in Chrome/Edge. Status should **not** say Home Screen is required.
2. [ ] Enable notifications and allow the permission prompt.
3. [ ] Test ping shows a system notification with the expected title/body.
4. [ ] Tap the notification body — app focuses or opens the default action (`/inbox/:id` or `/go/*`).
5. [ ] Send a notify with two actions (copy + link). Both buttons open the matching `/go/*` route.
6. [ ] Optional: Install app, repeat ping + tap.
7. [ ] iOS regression: Home Screen app still receives Declarative Web Push (including when the worker was evicted).
8. [ ] Multi-device: one token reaches both the Chromium client and an iPhone if both are subscribed.

## Agent curl

```bash
export SITE="https://YOUR_SITE.netlify.app"
export AGENT_API_TOKEN="the-token-from-netlify-env"

curl -sS -X POST "$SITE/v1/notify" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Build failed","body":"CI on main is red","url":"/"}'
```

On a multi-account deploy, create a token on **Tokens** and optionally add `"topic":"deploys"`. Alias: `POST /v1/t/deploys`. Agents should treat this as a fire-and-forget user-visible ping. See [AGENT.md](./AGENT.md) for the contract.

## Multi-account

Leave `MULTI_ACCOUNT` unset for today’s solo behavior (`AGENT_API_TOKEN` + global subscriptions).

To host more than one person on one Netlify site:

1. Set `MULTI_ACCOUNT=1` and a long random `SESSION_SECRET`.
2. Optionally set `INVITE_CODE` so signup is gated.
3. Open the PWA, create an account, enable notifications.
4. If this site already had solo subscriptions, tap **Claim this site** to attach them as devices and map `AGENT_API_TOKEN` onto that account.
5. Create agent tokens on `/tokens`. A token for account A cannot notify account B.

Topic rules:

- No `topic` on notify → every device on that account.
- `topic: "deploys"` → devices with all-topics `*` (the default) or an explicit `deploys` filter.
- Topics are account-scoped and created lazily.

Auth is email + password (or invite + password). Sessions are HTTP-only signed cookies. There is no magic-link email provider in v1.

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
| `POST` | `/api/signup` `/api/login` `/api/logout` | session cookie | Multi-account auth |
| `GET` | `/api/me` | session (or owner secret in solo) | Current account |
| `POST` | `/api/claim` | session | One-shot migrate of legacy solo subs |
| `GET/POST/PATCH/DELETE` | `/api/devices` | session | Device list + topic filters |
| `GET/POST/DELETE` | `/api/tokens` | session | Per-account agent tokens |
| `POST` | `/api/subscribe` | session in multi; `X-Owner-Secret` in solo | Store a push subscription |
| `DELETE` | `/api/subscribe` | session in multi; `X-Owner-Secret` in solo | Remove a subscription |
| `POST` | `/api/ping` | session in multi; `X-Owner-Secret` in solo | Owner test push |
| `GET` | `/api/inbox` / `/api/inbox/:id` | session in multi; `X-Owner-Secret` in solo | Inbox (`?topic=` filter) |
| `POST` | `/v1/notify` | account or solo bearer token | Agent push (rate limited) |
| `POST` | `/v1/t/:topic` | same | Notify a named topic |

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
  "data": { "agent": "optional" },
  "topic": "optional-account-topic"
}
```

Action types: `open_app` | `link` | `inbox` | `show_box` | `copy` (max 3 buttons). For `show_box`, optional `emoji` / `subtitle` / `message` / `bg` / `color` render a custom styled page; omit them for the default computer-preview instructions. `bg` and `color` are sanitized CSS (no `url()` / `expression` / `;`). Taps land on `/go/*` or `/inbox/:id`. The server always sends Declarative Web Push JSON (`web_push: 8030`, `mutable: true`, `silent: false`) with `navigate` + `notification.actions`. Dead endpoints (404/410) are deleted from Blobs. Each notify is stored for `GET /api/inbox`. In multi-account mode, Blobs keys are prefixed `accounts/{accountId}/…`.

## Layout

```
netlify/functions/   TypeScript Functions 2.0 handlers
netlify/lib/         Blobs, VAPID, auth, rate limit, inbox
public/sw.js         Push + action clicks + offline shell
src/                 PWA UI (home, auth, devices, tokens, inbox, /go router)
shared/              Payload validation used by Functions
mcp/                 MCP server for notify
skills/agent-notify/ Agent skill docs
```
