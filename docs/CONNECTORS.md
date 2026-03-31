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

### Key Files
- Route: `apps/api/src/routes/v1/connectors-slack.ts`
- Service: `apps/api/src/services/connectors/slack.ts`
- DB table: `slack_installations`

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

## Email

**Status: Outbound drafts only. Inbound OAuth not implemented — do not claim live inbound email.**

### What exists
- `apps/api/src/routes/v1/connectors-email.ts` — route scaffold
- `apps/api/src/routes/v1/actions.ts` — `email_draft` action type executes outbound send
- `apps/web/src/app/api/workspace/...` — email draft proxy routes
- DB table: `email_installations`, `email_outbound_drafts`

### What does NOT exist yet
- Real Gmail/IMAP OAuth flow (install-url returns a mock callback code)
- Inbound email ingestion to canonical events
- Email response monitoring loop

### UI Guidance
- Email "Connect" button on settings and landing page must show **"Coming soon"** (disabled state)
- Do not promise live inbound email until the real connector is built (post-v1)

### Post-v1 backlog
- Issue #14: Real Gmail OAuth connector
- Issue #15: Email response monitoring loop
