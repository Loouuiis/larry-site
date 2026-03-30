# Larry — Frontend

## Overview

Next.js 16 App Router at `apps/web/`. Two distinct surfaces:
1. **Marketing / landing page** — public routes (`/`, `/login`, `/signup`)
2. **Larry Workspace** — authenticated product (`/workspace/*`)

## Workspace Route Structure

```
/workspace                    WorkspaceHome — project grid, Action Centre summary strip
/workspace/projects/:id       ProjectPageClient → ProjectWorkspaceView
/workspace/projects/new       WorkspaceProjectIntake — unified draft lifecycle for manual/chat/meeting intake
/workspace/actions            Global Action Centre — cross-project Larry ledger (accept/dismiss)
/workspace/chats              Chat history grouped by project, deep-linkable from Action Centre
/workspace/my-work            Cross-project task view for current user
/workspace/meetings           Meetings overview
/workspace/settings           Connector settings (Slack, Google Calendar)
```

## Key Component Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/workspace/WorkspaceShell.tsx` | Root workspace layout (sidebar + topbar) |
| `apps/web/src/app/workspace/WorkspaceHome.tsx` | Dashboard: project grid, action strip, notifications |
| `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` | Active project detail: context, context timeline, Action Centre rail, Larry chat |
| `apps/web/src/app/workspace/projects/new/WorkspaceProjectIntake.tsx` | 3-mode unified intake draft lifecycle (manual / guided chat / meeting-led create-or-attach) |
| `apps/web/src/app/workspace/actions/page.tsx` | Global Action Centre page (canonical ledger, accept/dismiss) |
| `apps/web/src/app/workspace/chats/page.tsx` | Chat history with project grouping and Action Centre deep-link context |
| `apps/web/src/app/workspace/NotificationBell.tsx` | Bell with unread badge, dismiss flow |
| `apps/web/src/hooks/useLarryActionCentre.ts` | Shared Action Centre fetch, accept, dismiss, and background refresh for project and global surfaces |
| `apps/web/src/hooks/useProjectData.ts` | Fetches `/api/workspace/projects/:id/overview` (scoped), refreshes every 30s |
| `apps/web/src/hooks/useProjectMemory.ts` | Fetches `/api/workspace/projects/:id/memory` with source filtering for timeline context |

## Web API Proxy Layer

`apps/web/src/lib/workspace-proxy.ts` — session-aware proxy for all backend calls:
- Uses stored API tokens from session cookie
- Auto-refreshes on 401
- Per-request timeout override (`ProxyApiRequestOptions.timeoutMs`)

Web proxy routes (`apps/web/src/app/api/workspace/`):

**Canonical Larry routes (active):**
- `GET /larry/action-centre` - tenant-wide Larry action ledger (suggestions + activity + conversation previews)
- `GET /projects/:id/action-centre` - project-scoped action ledger
- `GET /projects/:id/memory` - project memory timeline entries with optional `?sourceKind=` filter
- `POST /larry/chat` - canonical chat persistence: persists user + assistant turn, writes linked `larry_events`
- `GET /larry/conversations` — conversation list with optional `?projectId=` filter
- `GET /larry/conversations/:id/messages` — message history for a conversation
- `POST /larry/events/:id/accept` — accept a suggested Larry event (executes and marks accepted)
- `POST /larry/events/:id/dismiss` — dismiss a suggested Larry event
- `GET /larry/briefing` — login briefing for current user
- `POST /meetings/transcript` — canonical transcript ingest (enqueues worker job, returns 202)
- `POST /projects/intake/drafts` — create/update intake draft (manual/chat/meeting)
- `POST /projects/intake/drafts/:id/bootstrap` — generate chat bootstrap preview (summary/tasks/actions/seed message)
- `POST /projects/intake/drafts/:id/finalize` — finalize intake draft into project creation or meeting attach path

**Other active routes:**
- `GET /projects/:id/overview` — scoped project read model (project + tasks + health + timeline + outcomes + meetings)
- `POST /projects` — create project
- `POST /tasks` — create task (also triggers canonical Larry auto-triage via `/v1/larry/chat`)
- `POST /tasks/triage` — manual Larry triage for existing task
- `GET /notifications` — notifications with `?unread=true` filter

**Retired / fenced routes (return 410):**
- `GET /larry/events` — retired; use `/larry/action-centre` or `/projects/:id/action-centre`
- `POST /larry/conversations` — retired; use `/larry/chat`
- `POST /larry/conversations/:id/messages` — retired; use `/larry/chat`
- `POST /actions/:id/approve`, `/reject`, `/correct` — retired; use `/larry/events/:id/accept` or `/dismiss`
- `GET /snapshot` - retired and fenced with `410 Gone`; use scoped `/home`, `/projects/:id/overview`, and `/larry/action-centre` routes

## Auth Bridge

`apps/web/src/lib/auth.ts` + `apps/web/src/middleware.ts`:
- Session stored as signed httpOnly cookie containing `apiAccessToken`, `apiRefreshToken`, `tenantId`, `role`, `email`
- `LARRY_API_BASE_URL` env set → uses API bridge for login
- Dev bypass: `GET /api/auth/dev-login` (enabled when `NODE_ENV !== production` or `ALLOW_DEV_AUTH_BYPASS=true`)
- **Dev Login button** on login/signup pages for local testing

## Design Direction (Monday.com-inspired, dark workspace)

**Workspace (dark theme):**
- Background: deep navy `#0D1117` — extends the sidebar colour to the full main content area
- Task table (not cards): Task name | Owner avatar | Status chip | Due date
- Tasks grouped by status with coloured left-border accents + collapse chevrons
- Status chips: pill-shaped, full-colour — Not Started=grey | In Progress=amber/blue | Done=green | Blocked=red/coral
- Owner avatars: initials circles (2 letters, brand colour background)
- Progress strip at bottom of each group (coloured segments = status distribution)
- Row click → `TaskDetailDrawer` slide-over from right

**Landing page (light theme):**
- White/light background, `#8B5CF6` purple accent, subtle gradients
- Effects-heavy but tasteful — inspired by ossus.librarlabs.com, Stripe Sessions
- Tone: serious, intelligent, premium B2B — not startup hype

**Brand constants:**
- Purple accent: `#8B5CF6`
- Framer Motion transitions throughout
- Sidebar structure: already dark, keep as-is

## UI Messaging Rules

- Product: "coordination layer for autonomous execution", "real-time source of truth", "approval-gated"
- Avoid: "chatbot", "magic", "AI assistant"
- Action Centre copy: "Prepared for your approval" — always pair with explainability (confidence, threshold, source signals)
- Do NOT claim in UI (until shipped): voice, PDF/PPT export, full notification centre, inbound email OAuth, external content import, "set up in 2 minutes", "no credit card needed"

## Frontend Rule for Claude Code Sessions

**Before touching any `.tsx`, `.css`, or layout file — invoke the `frontend-developer` subagent in `.claude/agents/`.**
