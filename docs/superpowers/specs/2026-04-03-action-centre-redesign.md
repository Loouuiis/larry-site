# Action Centre Redesign — Design Spec

**Date:** 2026-04-03
**Scope:** 5 features across frontend, API, and database

---

## 1. Filter, Search & Sort in Action Centre

**Current state:** The workspace action centre (`apps/web/src/app/workspace/actions/page.tsx`) shows all events in two columns — "Pending review" and "Recent activity" — with no filtering, searching, or sorting.

**Target state:** Add a toolbar (matching the existing Documents page pattern) above the events list with:

- **Search input**: Free-text search against `displayText`, `reasoning`, `projectName`, and `actionType`
- **Filter by action type**: Dropdown with action type categories (see Feature 5)
- **Filter by project**: Dropdown of projects that have events
- **Sort by**: Dropdown — "Newest first" (default), "Oldest first", "Action type A-Z"

**Implementation:**
- Add `search`, `filterActionType`, `filterProjectId`, `sortOrder` state to the page component
- Derive `displaySuggested` and `displayActivity` from the raw arrays using the same filter/sort pattern as `DocumentsPageClient.tsx`
- All filtering is client-side (data is already loaded via `useLarryActionCentre`)

---

## 2. Writing Actions → Documents Section

**Current state:** Email drafts are stored as `EmailDraft` records and shown inline in the action centre. The Documents page (`DocumentsPageClient.tsx`) only shows meeting transcripts. The project-level "Files" tab is an empty placeholder.

**Target state:** When Larry performs any writing action (email draft, letter, memo, report, etc.), it creates a `larry_document` record that appears in:
- The workspace-level Documents page
- The project-level Files tab

### New Database Table: `larry_documents`

```sql
CREATE TABLE IF NOT EXISTS larry_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id),
  larry_event_id UUID REFERENCES larry_events(id),
  
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('email_draft', 'letter', 'memo', 'report', 'note', 'other')),
  content TEXT NOT NULL,          -- The actual document body (plain text or markdown)
  
  -- Email-specific metadata (null for non-email docs)
  email_recipient TEXT,
  email_subject TEXT,
  email_sent_at TIMESTAMPTZ,
  
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'final', 'sent')),
  
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### API Endpoints

- `GET /v1/larry/documents?projectId=&docType=` — list documents
- `GET /v1/larry/documents/:id` — get single document
- `PATCH /v1/larry/documents/:id` — update document content/title
- `DELETE /v1/larry/documents/:id` — soft delete

### Frontend Changes

- **Documents page**: Extend `DocumentsPageClient.tsx` to fetch from both `/api/workspace/meetings` and `/api/workspace/larry/documents`, displaying them in a unified table with a "Type" column (transcript, email draft, letter, etc.)
- **Project Files tab**: Replace the empty state with a filtered view of `larry_documents` for that project, plus meeting transcripts tied to that project
- **Action Centre**: When a writing action is accepted, the linked document becomes accessible via a "View document" link on the event card

### Future: Gmail Integration
Email-type documents will eventually be sent through Gmail. For now, the document is created with `state: 'draft'` and a future Gmail integration will pick up documents with `doc_type: 'email_draft'` and `state: 'draft'` to send them.

---

## 3. Modify Action Button (Chat to Refine)

**Current state:** Each suggested event has two buttons: "Accept" and "Dismiss".

**Target state:** Add a third button — **"Modify"** — that opens a chat with Larry pre-loaded with the action context, allowing the user to refine the action before accepting it.

**Behaviour:**
1. User clicks "Modify" on a suggested action
2. A chat drawer opens (using the existing Larry chat pattern) with a pre-seeded message like: _"I'd like to modify this action: [displayText]. [reasoning]"_
3. The user chats with Larry to refine the action
4. Larry creates a new `larry_event` (a modified version) and marks the old one as `dismissed`
5. The new event appears in the pending review list

**Implementation:**
- Add a `POST /v1/larry/events/:id/modify` endpoint that:
  - Creates a new conversation (or continues the existing one if `conversationId` is set)
  - Seeds it with the action context
  - Returns the conversation ID
- Frontend: The "Modify" button dispatches `larry:open` + `larry:load-conversation` events (same pattern as "Open linked chat") with a modification context flag
- The Larry chat component handles the modification flow — user refines, Larry proposes a replacement event

---

## 4. Autonomy Level (1–5 Scale)

**Current state:** The Larry settings page has:
- An auto-execute toggle (on/off)
- Two confidence sliders (low impact 0–100%, medium impact 0–100%)
- Manual Larry rules

**Target state:** Replace the toggle + two sliders with a single **Autonomy Level** selector (1–5) that maps to predefined confidence thresholds.

### Autonomy Levels

| Level | Name | Description | Behaviour |
|-------|------|-------------|-----------|
| 1 | **Full Control** | Larry asks approval for everything | All actions are `suggested`, none auto-executed |
| 2 | **Cautious** | Larry auto-accepts only the simplest, clearest tasks the user has specified | Auto-execute only when `action_type` matches a user-defined rule AND impact is `low` |
| 3 | **Balanced** (default) | Larry automates simple tasks, user-specified tasks, and tasks it deems appropriate. Asks when unsure | Auto-execute low-impact + medium-impact when confidence ≥ 0.8. Suggest everything else |
| 4 | **Proactive** | Larry automates most things, only asks for high-impact or ambiguous actions | Auto-execute low + medium impact. Only suggest high-impact actions |
| 5 | **Full Autopilot** | Larry acts fully autonomously | All actions auto-executed regardless of impact or confidence |

### Database Changes

- Add column to the existing `tenant_settings` (or wherever policy is stored): `autonomy_level INTEGER NOT NULL DEFAULT 3 CHECK (autonomy_level BETWEEN 1 AND 5)`
- The existing `autoExecuteLowImpact`, `lowImpactMinConfidence`, `mediumImpactMinConfidence` columns remain as computed values derived from the autonomy level (backwards compatibility)

### API Changes

- `PATCH /api/workspace/settings/policy` — accept `autonomyLevel` (1–5) in addition to existing fields. When `autonomyLevel` is set, derive the other fields automatically.
- `GET /api/workspace/settings/policy` — return `autonomyLevel` alongside existing fields.

### Frontend Changes

- Replace the toggle + two sliders in `LarrySettingsPage` with a visual 5-level selector
- Each level shows its name + description
- The selected level is highlighted with `#6c44f6`
- Manual Larry rules section stays as-is

---

## 5. Action Type Classification & Tags

**Current state:** `actionType` is a free-text string on `WorkspaceLarryEvent` — displayed in the metadata line but not filterable or visually distinct.

**Target state:** Standardise action types and display them as filterable, colour-coded tags.

### Standard Action Types

| Key | Label | Colour (Larry palette) |
|-----|-------|----------------------|
| `create_task` | Creates Task | `#6c44f6` (purple) |
| `update_task` | Updates Task | `#8b6cf6` (light purple) |
| `draft_email` | Drafts Email | `#4f46e5` (indigo) |
| `draft_document` | Drafts Document | `#7c3aed` (violet) |
| `schedule_meeting` | Schedules Meeting | `#2563eb` (blue) |
| `update_status` | Updates Status | `#0891b2` (cyan) |
| `send_notification` | Sends Notification | `#0d9488` (teal) |
| `other` | Other | `#64748b` (slate) |

### Implementation

- Add a `getActionTypeTag(actionType: string)` utility that maps action types to `{ label, color }`
- Render as a pill/badge on each event card
- Use in the filter dropdown (Feature 1)
- No database changes needed — `action_type` is already stored; we just need consistent values from the AI pipeline and a frontend display utility

---

## Files to Create / Modify

### New Files
- `packages/db/src/migrations/XXX_larry_documents.sql` — new table + indexes
- `packages/db/src/migrations/XXX_autonomy_level.sql` — add column
- `apps/api/src/routes/v1/larry-documents.ts` — CRUD endpoints
- `apps/web/src/lib/action-types.ts` — action type tag utility
- `apps/web/src/components/ActionTypeTag.tsx` — reusable tag component

### Modified Files
- `apps/web/src/app/workspace/actions/page.tsx` — add toolbar, filter/search/sort, modify button, action type tags
- `apps/web/src/hooks/useLarryActionCentre.ts` — add modify mutation
- `apps/web/src/app/workspace/settings/larry/page.tsx` — replace sliders with 5-level selector
- `apps/web/src/app/workspace/documents/DocumentsPageClient.tsx` — merge larry_documents into display
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` — populate Files tab
- `apps/web/src/app/dashboard/types.ts` — add LarryDocument type, update PolicySettings
- `apps/api/src/routes/v1/larry.ts` — add modify endpoint
- `packages/db/src/schema.sql` — add larry_documents table definition
