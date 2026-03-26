# Larry — Frontend

## Overview

Next.js 16 App Router at `apps/web/`. Two distinct surfaces:
1. **Marketing / landing page** — public routes (`/`, `/login`, `/signup`)
2. **Larry Workspace** — authenticated product (`/workspace/*`)

## Workspace Route Structure

```
/workspace                    WorkspaceHome — project grid, Action Centre summary strip
/workspace/projects/:id       ProjectPageClient → ProjectWorkspace
/workspace/actions            Action Centre — pending/approved/rejected actions
/workspace/chats              Chat history grouped by project
/workspace/my-work            Cross-project task view for current user
/workspace/settings           Connector settings (Slack, Google Calendar)
```

## Key Component Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/workspace/WorkspaceShell.tsx` | Root workspace layout (sidebar + topbar) |
| `apps/web/src/app/workspace/WorkspaceHome.tsx` | Dashboard: project grid, action strip, notifications |
| `apps/web/src/components/dashboard/ProjectWorkspace.tsx` | Project detail tabs (Overview/Timeline/Analytics/Docs/Meetings/Org) |
| `apps/web/src/components/dashboard/TaskTable.tsx` | Monday.com-style task table |
| `apps/web/src/components/dashboard/StatusChip.tsx` | Consistent status pill component |
| `apps/web/src/components/dashboard/StartProjectFlow.tsx` | 3-mode project creation modal |
| `apps/web/src/app/workspace/actions/page.tsx` | Action Centre page |
| `apps/web/src/app/workspace/actions/SourceContextCard.tsx` | Source excerpt + reasoning per action |
| `apps/web/src/app/workspace/NotificationBell.tsx` | Bell with unread badge, dismiss flow |
| `apps/web/src/hooks/useProjectData.ts` | Fetches `/api/workspace/snapshot?projectId=:id`, refreshes every 30s |

## Web API Proxy Layer

`apps/web/src/lib/workspace-proxy.ts` — session-aware proxy for all backend calls:
- Uses stored API tokens from session cookie
- Auto-refreshes on 401
- Per-request timeout override (`ProxyApiRequestOptions.timeoutMs`)
- AI agent runs: 60s timeout (LLM processing can exceed default 12s)

Web proxy routes (`apps/web/src/app/api/workspace/`):
- `GET /snapshot` — aggregated project + tasks + actions + health + activity
- `POST /projects` — create project
- `POST /tasks` — create task (also triggers auto AI triage)
- `POST /tasks/triage` — manual AI triage for existing task
- `POST /actions/:id/approve`, `/reject`, `/correct`
- `POST /larry/commands` — command ingress
- `POST /larry/run` — freeform PM prompt
- `GET /larry/conversations` — conversation history with `projectId`
- `GET /notifications` — notifications with `?unread=true` filter

## Auth Bridge

`apps/web/src/lib/auth.ts` + `apps/web/src/middleware.ts`:
- Session stored as signed httpOnly cookie containing `apiAccessToken`, `apiRefreshToken`, `tenantId`, `role`, `email`
- `LARRY_API_BASE_URL` env set → uses API bridge for login
- Dev bypass: `GET /api/auth/dev-login` (enabled when `NODE_ENV !== production` or `ALLOW_DEV_AUTH_BYPASS=true`)
- **Dev Login button** on login/signup pages for local testing

Legacy Turso paths still exist in some routes (`apps/web/src/lib/db.ts`) — do not introduce new Turso dependencies. The workspace runs entirely on the Fastify API bridge.

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
