# Hierarchical File Management for Larry

**Date:** 2026-04-05
**Status:** Approved

## Problem

Larry's document system is flat — files sit in a single list filtered by project or type. There's no folder hierarchy, no way to organize documents within a project, and the sidebar doesn't connect projects to their files. It looks primitive compared to Google Drive or Notion.

## Goals

- Google Drive-style folder browser on the Documents page
- Auto-created root folder per project (tagged "Project")
- Permanent "General" folder for non-project documents (tagged "General")
- User-created folders at root level (tagged "Company") or as subfolders anywhere
- 5 levels of nesting max (depth 0–4)
- Drag-and-drop + right-click "Move to..." for reorganizing
- Sidebar project click navigates to that project's folder in the documents page
- No collapsible file tree in the sidebar — keeps it clean

## Architecture: Approach A — Dedicated `folders` table

### Database

New `folders` table:

```sql
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  folder_type TEXT NOT NULL DEFAULT 'general'
    CHECK (folder_type IN ('project', 'company', 'general')),
  depth INT NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 4),
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_tenant_parent
  ON folders (tenant_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_folders_tenant_project
  ON folders (tenant_id, project_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_folders
    ON folders
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

Schema changes to existing tables:

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE larry_documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents (tenant_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_larry_documents_folder ON larry_documents (tenant_id, folder_id);
```

### Column Reference

| Column | Purpose |
|--------|---------|
| `id` | Primary key |
| `tenant_id` | Tenant isolation (RLS) |
| `project_id` | Set for project root folders; NULL for company/general |
| `parent_id` | NULL = root folder; otherwise references parent folder |
| `name` | Display name |
| `folder_type` | `project` (auto-created), `company` (user-created root), `general` (permanent) |
| `depth` | 0 = root, max 4 = 5th level. Enforced on insert/move |
| `sort_order` | For manual ordering within a parent |
| `created_by_user_id` | Who created it |
| `created_at` / `updated_at` | Timestamps |

### API Routes

**New Fastify routes (`apps/api/src/routes/v1/folders.ts`):**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/folders` | List folders at root or within a parent (`?parentId=`). Returns folders + documents in that folder |
| `POST` | `/v1/folders` | Create folder. Body: `{ name, parentId?, folderType }`. Validates depth <= 4 |
| `PATCH` | `/v1/folders/:id` | Rename folder. Body: `{ name }` |
| `PATCH` | `/v1/folders/:id/move` | Move folder. Body: `{ newParentId }`. Recalculates depth for folder + descendants, rejects if any exceed 4 |
| `DELETE` | `/v1/folders/:id` | Delete folder + cascade. Block deletion of project root folders and the General folder |

**New document move routes:**

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/v1/documents/:id/move` | Move document to folder. Body: `{ folderId }` |
| `PATCH` | `/v1/larry-documents/:id/move` | Move larry document to folder. Body: `{ folderId }` |

**Modified existing routes:**

- `GET /v1/documents` — add optional `folderId` query param for filtering
- `POST /v1/documents` — accept optional `folderId` in body
- Project creation route — after inserting project, auto-insert root folder with `folder_type = 'project'`

**Frontend proxy routes (`apps/web/src/app/api/workspace/folders/`):**

Mirror backend routes using the same proxy pattern as existing `documents` API routes.

### Access Control

- **Project folders**: Access checked via `project_memberships` (same as documents today)
- **Company/General folders**: Access checked via tenant membership (any authenticated tenant member)
- Folder deletion blocked for: project root folders, the "General" folder

### Frontend: Documents Page

**Replace** the flat table in `DocumentsPageClient.tsx` with a folder browser:

**Components:**
1. **Breadcrumb bar** — `Documents > Q2 Product Launch > Design Assets`. Each segment clickable. Built from parent chain.
2. **Toolbar** — Search input, "New folder" button, Upload button, sort dropdown (name / date / type)
3. **Content area** — Folders first (sorted by name), then documents below (sorted by date). Each shows icon + name + type badge + date.
4. **Context menu** (right-click) — Open, Rename, Move to..., Delete
5. **Drag-and-drop** — Drag file/folder onto a folder to move. Purple (`#6c44f6`) border on valid drop targets. Reject drops exceeding depth 5.
6. **"Move to..." modal** — Folder tree picker (lazy-loaded, expandable). Confirm button moves item.
7. **Empty state** — Centered folder icon + "This folder is empty" + action prompt

**Folder badges:**
- Project: Purple `#6c44f6` badge — "Project"
- Company: Neutral grey badge — "Company"
- General: Neutral grey badge — "General"

**State management:**
- Component-level `currentFolderId` (null = root view)
- Breadcrumb path fetched via API or built client-side from parent chain
- No global state library — consistent with existing Larry patterns

### Sidebar Changes

- Clicking a project in the sidebar navigates to `/workspace/documents?folderId={projectRootFolderId}`
- The "Documents" nav item continues to go to `/workspace/documents` (root view)
- No collapsible tree in the sidebar — keeps it clean

### Auto-creation Hooks

1. **Project creation** — After inserting a project row, insert root folder:
   ```sql
   INSERT INTO folders (tenant_id, project_id, name, folder_type, depth)
   VALUES ($1, $2, <project_name>, 'project', 0)
   ```
2. **Tenant seeding** — Insert "General" folder for each tenant (migration for existing tenants):
   ```sql
   INSERT INTO folders (tenant_id, name, folder_type, depth)
   VALUES ($1, 'General', 'general', 0)
   ```
3. **Existing project backfill** — Migration creates root folders for all existing projects that don't have one yet.

### Migration Strategy

1. Add `folders` table + indexes + RLS
2. Add `folder_id` column to `documents` and `larry_documents`
3. Backfill: create root folders for existing projects, create "General" folder per tenant
4. Backfill: set `folder_id` on existing documents to match their `project_id`'s root folder (documents with no project go to General)

## Out of Scope

- Binary file upload/storage (S3) — existing system stores content in DB; not changing this
- File versioning UI — `version` column exists but not surfaced
- Sharing/permissions per-folder — inherits from project/tenant membership
- Tags or custom metadata on folders
- Folder-level search (global search remains as-is)
