# Larry — Channel Connectors

## Overview

Connectors ingest signals from external channels into `canonical_events`, which then drive the agent pipeline. All connectors normalise to the same canonical event format before reaching the worker.

## Slack

**Status: Live (OAuth + event ingestion working)**

### Endpoints (`/v1/connectors/slack/`)
| Route | Purpose |
|-------|---------|
| `GET /install-url` | Generate Slack OAuth install URL (requires `admin\|pm` role) |
| `GET /callback` | Slack OAuth redirect handler — stores installation |
| `POST /events` | Signature-verified Slack Events webhook |
| `GET /status` | Returns connector install status for tenant |
| `GET /channels` | List Slack channels accessible to the bot |
| `GET /channel-mapping` | Get all channel-to-project mappings for the tenant |
| `PUT /channel-mapping` | Upsert or delete a channel-to-project mapping (requires `admin\|pm` role) |

### Key Files
- Route: `apps/api/src/routes/v1/connectors-slack.ts`
- Service: `apps/api/src/services/connectors/slack.ts`
- DB tables: `slack_installations`, `slack_channel_project_mappings`

### Required Env Vars
```
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
SLACK_REDIRECT_URI
SLACK_SIGNING_SECRET
SLACK_BOT_SCOPES
SLACK_SIGNATURE_TOLERANCE_SECONDS
SLACK_OAUTH_STATE_TTL_SECONDS   (default: 3600)
```

### Setup Notes
- `url_verification` challenge is handled before signature checks (required for Slack first-time setup)
- OAuth state `userId` uses `string().min(1)` not strict UUID (seeded dev IDs are non-RFC variant)
- Webhook content-type accepts JSON with charset via regex parser
- For local testing: ngrok required. Binary at `C:\Users\oreil\tools\ngrok\ngrok.exe`. Domain: `sunny-sericate-kamari.ngrok-free.dev`
- System RLS policy (`app.tenant_id='__system__'`) used for workspace→tenant resolution on inbound webhooks

---

## Google Calendar

**Status: Live (OAuth + watch + webhook working; renewal token fix applied)**

### Endpoints (`/v1/connectors/google-calendar/`)
| Route | Purpose |
|-------|---------|
| `GET /install-url` | Generate Google OAuth URL |
| `GET /callback` | OAuth token exchange + installation upsert |
| `GET /status` | Returns connector status |
| `GET /project-link` | Read default project linkage for a calendar installation |
| `PUT /project-link` | Set or clear default project linkage (`projectId: null` clears) |
| `POST /watch` | Register Google push notification watch channel |
| `POST /webhook` | Receive Google push notifications |

### Key Files
- Route: `apps/api/src/routes/v1/connectors-google-calendar.ts`
- Service: `apps/api/src/services/connectors/google-calendar.ts`
- Renewal job: `apps/worker/src/calendar-renewal.ts`
- DB table: `google_calendar_installations`

### Required Env Vars
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_CALENDAR_SCOPES
GOOGLE_OAUTH_STATE_TTL_SECONDS
GOOGLE_CALENDAR_WEBHOOK_URL
```

### Known Behaviour
- Webhook project scope resolution is:
  1. explicit payload `projectId` hint (if present)
  2. otherwise the installation default project link (`google_calendar_installations.project_id`)
- Calendar write mutations are now governed by Larry Action Centre accept flow:
  - `calendar_event_create` and `calendar_event_update` execute only after acceptance.
  - accept execution resolves the project-linked installation and writes to Google Calendar via API create/update.
  - expired access tokens are refreshed with stored refresh token before write execution.
  - missing project-linkage returns an actionable error to link Google Calendar to that project first.
- Channel token is compacted to short keys (`{ k, t, i }`) — Google enforces 256-char token limit.
- Webhook rejects missing/invalid `x-goog-channel-token`. Renewal job must include the token field to match the initial registration — without this, calendar silently breaks after 7 days (the renewal fix was applied in Session 5).
- Push webhooks deliver metadata only (no rich event text). Worker's `extractActionableText()` may return null for calendar events — calendar enrichment fetch (events detail pull) is a planned improvement.

---

## Outlook Calendar

**Status: Live (OAuth + webhook ingestion working)**

### Endpoints (`/v1/connectors/outlook-calendar/`)
| Route | Purpose |
|-------|---------|
| `GET /install-url` | Generate Microsoft OAuth URL (requires `admin\|pm` role) |
| `GET /callback` | OAuth token exchange + installation upsert, redirects to settings page |
| `GET /status` | Returns connector status (auto-refreshes token if about to expire) |
| `GET /project-link` | Read default project linkage for an Outlook calendar installation |
| `PUT /project-link` | Set or clear default project linkage (`projectId: null` clears; requires `admin\|pm` role) |
| `POST /webhook` | Receive Microsoft Graph change notifications (subscription validation + event ingestion) |

### Key Files
- Route: `apps/api/src/routes/v1/connectors-outlook-calendar.ts`
- Service: `apps/api/src/services/connectors/outlook-calendar.ts`
- DB table: `outlook_calendar_installations`

### Required Env Vars
```
OUTLOOK_CLIENT_ID
OUTLOOK_CLIENT_SECRET
OUTLOOK_REDIRECT_URI
OUTLOOK_CALENDAR_SCOPES           (default: "offline_access openid profile User.Read Calendars.ReadWrite")
OUTLOOK_OAUTH_STATE_TTL_SECONDS   (default: 3600)
```

### Known Behaviour
- OAuth flow uses Microsoft identity platform (`login.microsoftonline.com/common/oauth2/v2.0`), so works with both personal and org accounts.
- Webhook handles Microsoft Graph subscription validation (returns `validationToken` as plain text) and change notification ingestion in a single endpoint.
- Subscription lookup is by `outlook_subscription_id` column. Additional columns `outlook_subscription_client_state` and `outlook_subscription_expiration` track subscription security and renewal.
- Client state validation: if the installation has `outlook_subscription_client_state` set, incoming webhooks must match or they are rejected.
- Webhook project scope resolution mirrors Google Calendar: the installation's `project_id` is attached as a hint when ingesting the canonical event.
- Calendar write mutations (`calendar_event_create`, `calendar_event_update`) are supported via the Larry Action Centre accept flow, same as Google Calendar. The `larry.ts` route resolves the project-linked installation and falls back across providers (Google first, then Outlook).
- Token refresh: `ensureFreshOutlookAccessToken` proactively refreshes tokens within 60 seconds of expiry. Missing refresh token triggers a reconnect error.
- No worker renewal job exists yet (unlike Google Calendar). Microsoft Graph subscriptions expire after 3 days; renewal is a planned improvement.

---

## Email

**Status: Gmail OAuth live. Mock fallback for non-Gmail. Inbound webhook + outbound send both functional.**

### Endpoints (`/v1/connectors/email/`)
| Route | Purpose |
|-------|---------|
| `GET /status` | Returns connector install status |
| `GET /install-url` | Generate Gmail OAuth URL (or mock URL for non-Gmail providers; requires `admin\|pm` role) |
| `GET /callback` | OAuth token exchange + installation upsert, redirects to settings page |
| `POST /inbound` | Secret-verified inbound email webhook — ingests to canonical events |
| `POST /draft/send` | Create outbound draft and optionally send immediately (requires `admin\|pm` role) |
| `GET /drafts` | List outbound drafts for the tenant (filterable by state) |

### Key Files
- Route: `apps/api/src/routes/v1/connectors-email.ts`
- `apps/web/src/app/api/workspace/...` — email draft proxy routes
- DB table: `email_installations`, `email_outbound_drafts`

### Known Behaviour
- When `EMAIL_CONNECTOR_PROVIDER=gmail`, real Gmail OAuth and send via Gmail API are active. Otherwise falls back to mock OAuth and Resend for delivery.
- Inbound webhook validates `x-larry-email-secret` header with timing-safe comparison against the installation's `webhook_secret`.
- Draft send creates a `documents` record (type `email_draft`) alongside the `email_outbound_drafts` row.
- Gmail send failure does not block draft creation — the draft is saved and a warning is logged.

### Post-v1 backlog
- Issue #15: Email response monitoring loop
