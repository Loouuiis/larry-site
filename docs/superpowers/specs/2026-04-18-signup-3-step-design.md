# Signup wizard: collapse 8 hidden steps to 3 visible steps

**Issue:** [#86](https://github.com/Loouuiis/larry-site/issues/86)
**Sprint:** Launch 2026-04-19
**Author:** fergo5002 (driven by Claude Opus 4.7 with autonomy)
**Date:** 2026-04-18

## Problem

Current signup (`apps/web/src/app/(auth)/signup/SignupWizard.tsx`) has `TOTAL_STEPS = 8`:
Welcome splash → Email+auth → Profile+password+avatar → Role → Work type → Discovery → Tools → Completion splash. The 4 polling steps (Role/Work/Discovery/Tools) are UI-only — their answers never reach the backend. Industry B2B SaaS median is 2–3 steps; each extra step costs ~15–20% conversion.

## Goal

Land new users on `/workspace` with a first project and the Action Centre visible, in **under 90 seconds** from landing, through a **3-step** wizard.

## Flow

```
Landing page → "Get started" CTA
  → /signup
    ├─ Step 1 — Account + role
    ├─ Step 2 — Workspace + optional invites
    └─ Step 3 — First project + Google Calendar prompt
  → /workspace?project=<new-id>&openActionCentre=1
```

**Dropped:**

- Step 0 "Welcome" splash — the landing page already does that work.
- Step 7 "You're good to go!" splash — direct-to-workspace IS the satisfaction moment.

## Step-by-step design

### Step 1 — Account + role (single screen)

**Fields (in order):**

1. **Sign up with Google** button (top, provider OAuth — same `GoogleSignInButton` component that exists today).
2. "or" divider.
3. **Email** (autofocus, `type=email`, autocomplete=email).
4. **First name** + **Last name** (side-by-side, `autocomplete=given-name/family-name`).
5. **Password** (show/hide toggle, strength meter — keep today's `getPasswordStrength`).
6. **Role** — one-select chip grid, 9 options (keep today's `ROLES` constant).
7. **Terms checkbox** (required): "I agree to the Terms of Service and Privacy Policy".
8. **Subscribe to updates** (default checked, can uncheck).

**Omissions vs. today:**

- **Password confirm** — removed. Replaced by show/hide toggle (strictly better UX, Linear and Motion follow the same pattern). Saves a field.
- **Profile photo upload** — deferred to `/workspace/settings/profile` in-app (accessed via avatar click).

**Submit:** `POST /api/auth/signup` with `{email, password, firstName, lastName, role}`. Response issues tokens, advances to Step 2.

### Step 2 — Workspace + optional invites

**Fields:**

1. **Workspace name** — prefilled with `${firstName}'s workspace`, editable. Placeholder: "Acme Inc.".
2. **Invite teammates** (optional): 3 stacked email inputs with an **+ Add another** button for more. Below: "We'll send them an invite link. You can skip this — you can invite from Settings any time."
3. **Continue** button.

**Submit:**

- Rename tenant via `PATCH /api/workspace/tenant` (new helper; see backend section). Only fires if name differs from default.
- For each non-empty, valid email: `POST /api/orgs/invitations` (reuse existing RBAC-v2 endpoint from PRs #71/#74/#75). Fire-and-forget; errors show as inline red dots next to the offending field but don't block progression.

### Step 3 — First project + Google Calendar

**Fields:**

1. **Project name** (required, autofocus). Placeholder: "e.g., Website redesign".
2. **Connect Google Calendar** button — opens GCal OAuth in a popup. On success, a soft green check replaces the button. On decline/close, user proceeds regardless.
3. **Go to Larry** button (enabled when project name is filled).

Skippable via small `Skip for now →` text under Continue — lands on `/workspace` with no project.

**Submit:**

- `POST /api/workspace/projects` with `{name}`.
- If GCal was connected, the OAuth flow already wrote credentials — nothing extra.
- Redirect to `/workspace?project=<new-id>&openActionCentre=1`.

## Post-signup polling card

**Where it lives:** `/workspace` home. New dismissible card component `PollingCard`, rendered above "Your projects" when `user_profiles.completed_at IS NULL AND dismissed_at IS NULL`.

**What it captures:**

- Work type (multi-select up to 5, 21 options — reuse today's `WORK_TYPES`).
- Discovery source (multi-select up to 3, 11 options — reuse today's `DISCOVERY_OPTIONS`).
- Tools (multi-select unlimited, 16 options — reuse today's `TOOLS`).

**Affordances:** a "Submit" button that persists + hides the card. A "Not now" link that hides for the session. An "x" close icon that hides for good (`dismissed_at` set). No persistent nag.

## Backend changes

### Migration — `packages/db/src/schema.sql` + new migration file

```sql
-- Add role column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;

-- New table for extended profile data captured post-signup
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  work_types    TEXT[] NOT NULL DEFAULT '{}',
  discovery     TEXT[] NOT NULL DEFAULT '{}',
  tools         TEXT[] NOT NULL DEFAULT '{}',
  completed_at  TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_profiles_tenant_idx
  ON user_profiles (user_id)
  WHERE completed_at IS NULL AND dismissed_at IS NULL;
```

### API — accept `role` at signup

`apps/api/src/routes/v1/auth.ts`:

- Extend `SignupSchema` with `role: z.string().max(100).optional()`.
- Insert `role` into `users` row.
- All other signup behaviour unchanged.

### API — profile update

New route `apps/api/src/routes/v1/user-profile.ts`:

- `GET /v1/user/profile` → returns `{ workTypes, discovery, tools, completedAt, dismissedAt }`.
- `POST /v1/user/profile/complete` → upserts `{ workTypes, discovery, tools }` + sets `completed_at = NOW()`.
- `POST /v1/user/profile/dismiss` → upserts empty row + sets `dismissed_at = NOW()`.

### Web proxy

New files under `apps/web/src/app/api/user/profile/`:

- `route.ts` (GET) — proxies `/v1/user/profile`.
- `complete/route.ts` (POST) — proxies `/v1/user/profile/complete`.
- `dismiss/route.ts` (POST) — proxies `/v1/user/profile/dismiss`.

## UI components

### Step indicator

`StepDots` in `SignupWizard.tsx` — pass `total={3}`, active dot widens (pattern already there, unchanged).

### Polling card

New component `apps/web/src/components/workspace/PollingCard.tsx`:

- Dismissible, three chip selectors stacked vertically, one "Submit" button.
- Renders `null` if `GET /api/user/profile` returns `{ completedAt || dismissedAt }`.
- Mounted on `/workspace` page above the empty-state / projects-list block.

## Acceptance (from #86)

- **Landing → first-seen Action Centre under 90s on desktop.** Verified with a stopwatch on the preview deploy.
- **Step indicator shows 3 dots.** Visual.
- **Every previously-required field is either merged into a kept step or deferred.** Tracked by:
  - Email → Step 1 ✓
  - Password → Step 1 ✓
  - firstName/lastName → Step 1 ✓
  - Role → Step 1 (new; captured into DB) ✓
  - Password confirm → **dropped** (show/hide toggle replaces it)
  - Profile photo → **deferred** to `/workspace/settings/profile`
  - Work type / Discovery / Tools → **deferred** to post-signup polling card (captured into DB)
  - Terms + subscribe checkboxes → Step 1 ✓
  - Workspace name → Step 2 ✓ (new)
  - Invite teammates → Step 2 ✓ (new, optional)
  - First project → Step 3 ✓ (new)
  - GCal connect → Step 3 ✓ (new, optional)

## Out of scope (follow-ups)

- Profile photo upload UI on `/workspace/settings/profile` (currently not implemented; today's signup-time upload goes to a non-existent handler via `/api/auth/update-profile`, so deferring it loses nothing).
- Email-connector prompt post-signup.
- RBAC role-assignment on invite step (current flow assigns `member`; the invite modal elsewhere in the app handles role selection).
- Legal pages (Privacy/Terms/Cookie) — still needed for launch, but separate issue.

## Performance notes

- Account creation on Step 1 is the only blocking network call before Step 2 renders. Average ~200ms on Railway.
- Tenant rename + invitation sends in Step 2 fire in parallel with navigation to Step 3 (non-blocking).
- First project creation in Step 3 fires before redirect (blocking, ~100ms).
- GCal OAuth popup doesn't block the main form; if user clicks Connect and walks away, they can still click Go to Larry without waiting.
