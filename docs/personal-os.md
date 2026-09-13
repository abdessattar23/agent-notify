# Personal OS Dashboard

Draft preview only. Do **not** merge this as a production rollout. Do **not** paste production secrets into preview deploys, chat logs, or this branch.

This feature ingests **sanitized bot-published events** and aggregates them for a single-owner dashboard. There is no documented Grok control-plane API. Do not scrape any Grok UI. Do not connect this code to company systems.

## Architecture

```
Grand Master Bot (future)     Other allowlisted bots
        |                              |
        v                              v
 POST /api/personal-os/events   (per-bot bearer token)
        |
        +-- strict schema + allowlists + privacy reject
        +-- idempotent Blobs write (90-day TTL prune)
        +-- optional meaningful-alert notify (env-gated)
        v
 GET /api/personal-os/dashboard  (owner secret / session)
        v
 /os  Today · Outcomes · Bots · Routines · Decisions · Approvals · Failures
```

- Functions v2 live at `/api/personal-os/*` via `export const config.path`. No redirects shadow them.
- Shared validation is in `shared/personal-os.ts`.
- Storage is isolated by deploy (see **Shared Blobs / deploy isolation** below). The SDK has no `getStore({ deploySpecific: true })` flag; drafts use `getDeployStore({ name: "personal-os" })`. The published production hostname is the only path to the site-scoped ledger.
- Rate limits reuse `consumeNamedRateLimit` in `netlify/lib/rate-limit.ts` (`personal-os:<sourceBot>`).
- Owner reads follow the existing solo `requireOwnerAccess` / `OWNER_SETUP_SECRET` pattern on `main`. This branch does not take code from open multi-account PRs.

Stored timestamps are UTC ISO-8601. Every display field (`*Local`, `generatedAtLocal`) is formatted with `Intl` in **`Africa/Casablanca`**. Casablanca is UTC+1 year-round.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Stolen bot token | Per-source bearer tokens, timing-safe compare, hourly per-bot rate limit |
| Cross-bot spoofing | Token must match the payload `sourceBot`; other bots’ tokens are rejected |
| Schema smuggling | Unknown / oversized fields rejected; enums allowlisted |
| Secret or company data in the ledger | Reject Sofrecom/Orange systems, internal GitLab, Mercury/Cloud Foundry, credentials, email bodies, CV/private-file contents |
| Source URL abuse | `https` only; credentials in URLs rejected; UI opens `rel="noopener noreferrer"` |
| Production sample pollution | Seed requires `PERSONAL_OS_ALLOW_SEED` and is **always refused** on `https://agent-notify.netlify.app`. Draft/preview hostnames (`*--agent-notify.netlify.app`) may seed even if Netlify sets `CONTEXT=production` on a CLI draft. |
| Shared Blobs / deploy isolation | Site-scoped `getStore("personal-os")` is shared across every deploy. CLI `netlify deploy` (no `--prod`) still builds with `CONTEXT=production` and would otherwise write the production ledger. Unpublished deploys and `*--agent-notify.netlify.app` hosts use `getDeployStore({ name: "personal-os" })` so draft ingest/seed cannot touch production Blobs. Isolation is keyed on request/deploy hostname and `context.deploy.published`, **never** on `CONTEXT` alone. Ambiguous inherited `URL`/`SITE_URL` defaults to deploy-scoped. Rate-limit counters for Personal OS live in the same store as events. |
| Notify noise / inbox spam | `PERSONAL_OS_NOTIFY_ENABLED` off by default; only approval, deadline, failure/stale, or high-value opportunity |
| Retention / leak-over-time | 90-day TTL prune on write and read; max 500 events |

Do not ingest raw email, resumes, employer documents, or any Orange/Sofrecom/GitLab/CF payload. Summaries only.

### Shared Blobs / deploy isolation

| Deploy | Typical host | Store |
| --- | --- | --- |
| Published production | `https://agent-notify.netlify.app` | Site-scoped `getStore("personal-os")` |
| CLI draft / deploy-preview / unpublished | `https://<id-or-preview>--agent-notify.netlify.app` | Deploy-scoped `getDeployStore({ name: "personal-os" })` |
| Local `npm run dev` | `127.0.0.1` | File store under `.data/blobs/personal-os-deploy` |

Do not run `netlify deploy --prod` from this branch. A draft URL is safe to seed only with preview tokens and `PERSONAL_OS_ALLOW_SEED=1`.

## Retention and privacy

- Default TTL: **90 days** (`PERSONAL_OS_RETENTION_DAYS`).
- Prune runs on ingest and dashboard read.
- Store metadata + short sanitized `title` / `impact` / `nextAction` only.
- `metricDelta` is outcome KPIs only (OTel, CFPs, jobs, talks, engineering missions, personal ops). No vanity event counters.

## Env vars (placeholders only)

Set these in Netlify **Deploy Preview** or local `.env`. Never commit values.

| Name | Purpose |
| --- | --- |
| `PERSONAL_OS_BOT_TOKENS` | JSON map `{"grand-master":"<set-in-ui>","otel-scout":"<set-in-ui>"}` |
| `PERSONAL_OS_TOKEN_<BOT>` | Alternate per-bot token. `otel-scout` → `PERSONAL_OS_TOKEN_OTEL_SCOUT` |
| `OWNER_SETUP_SECRET` | Existing owner header/bearer for dashboard + seed |
| `PERSONAL_OS_RATE_LIMIT_PER_HOUR` | Default `60` per source bot |
| `PERSONAL_OS_RETENTION_DAYS` | Default `90` |
| `PERSONAL_OS_NOTIFY_ENABLED` | `1` to push meaningful alerts through the existing notify pipeline |
| `PERSONAL_OS_ALLOW_SEED` | `1` to enable DEV-ONLY seed (always blocked on the production hostname; allowed on draft/preview hosts) |

If no bot tokens are configured, ingest returns `503 personal_os_tokens_unconfigured`.

## API

### `POST /api/personal-os/events`

Bearer token for `sourceBot`. Idempotent on `eventId`.

```json
{
  "eventId": "gm-2026-09-13-01",
  "sourceBot": "grand-master",
  "timestamp": "2026-09-13T09:00:00.000Z",
  "area": "otel",
  "status": "opportunity",
  "title": "Qualified OTel workshop slot",
  "impact": "Community CFP wants a tracing workshop.",
  "sourceUrl": "https://example.com/cfp",
  "nextAction": "Draft abstract",
  "decisionNeeded": false,
  "approvalNeeded": false,
  "nextRun": "2026-09-14T09:00:00.000Z",
  "deadline": "2026-09-15T18:00:00.000Z",
  "metricDelta": { "otelOpportunities": 1 }
}
```

Allowlisted `sourceBot`: `grand-master`, `otel-scout`, `cfp-scout`, `jobs-scout`, `talks-coach`, `eng-missions`, `personal-ops`, `routines`.

Allowlisted `area`: `otel`, `cfp`, `jobs`, `talks`, `engineering`, `personal-ops`, `routines`, `decisions`, `approvals`.

Allowlisted `status`: `ok`, `info`, `stale`, `error`, `blocked`, `pending_approval`, `decision_needed`, `deadline`, `done`, `failed`, `opportunity`.

### `GET /api/personal-os/dashboard`

Owner-authenticated aggregation for the `/os` views.

### `POST /api/personal-os/seed`

Owner-authenticated, DEV-ONLY. Disabled unless `PERSONAL_OS_ALLOW_SEED=1`. Always refused on `https://agent-notify.netlify.app`. Allowed on `*--agent-notify.netlify.app` draft/preview hosts even if `CONTEXT=production`.

## Notify

When `PERSONAL_OS_NOTIFY_ENABLED=1` and VAPID is configured, ingest may call the existing `sendToAllSubscriptions` path **only** for:

- approval required
- deadline
- failure / stale bot
- high-value `opportunity`

Routine `ok` / heartbeat-style events are silent. Idempotent replays do not notify again.

## Migration / backfill (Grand Master ledger)

1. Grand Master Bot keeps the source of truth as a **sanitized shared ledger** (no mail bodies, no CVs, no employer systems).
2. Each ledger row maps 1:1 onto the event schema above. Use stable `eventId`s from the ledger so backfill is idempotent.
3. Replay from oldest-to-newest against a **preview** site with preview-only bot tokens.
4. Confirm Casablanca grouping and KPI totals, then point production tokens at production later — this PR does not do that.
5. Do not backfill rejected classes of content; drop or rewrite those rows at the publisher.

## Tests and seed

```bash
npm test
npm run typecheck
```

Local synthetic seed (not production):

```bash
# in .env (local only)
PERSONAL_OS_ALLOW_SEED=1
PERSONAL_OS_TOKEN_GRAND_MASTER=local-only-placeholder
# then, with `npm run dev` running:
npm run seed:personal-os
```

Or open `/os` and use **Load DEV-ONLY sample** when the seed flag is on.

## Explicit non-goals

- No production deploy from this branch
- No production env secrets in git
- No Grok API / UI automation
- No Sofrecom, Orange, internal GitLab, Mercury, or Cloud Foundry connectors
