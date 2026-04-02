# Larry Frontend vs. Product Spec: Alignment Report

> Generated 2 April 2026 | Compared: `Product/` folder (xlsx specs) vs `apps/web/` codebase

---

## How to Read This Report

Each section identifies a **spec requirement**, the **current state**, and a **concrete fix**. Items are grouped by severity:

- **P0 — Brand-breaking**: Wrong colours/fonts that misrepresent the brand everywhere
- **P1 — Missing core surfaces**: Features described in the product spec with no UI at all
- **P2 — Partial implementations**: Features that exist but diverge from spec behaviour
- **P3 — Polish/fit-and-finish**: Minor inconsistencies that affect perceived quality

---

## P0 — Brand-Breaking Issues

### 0.1 Brand Purple Is Wrong

| | Spec | Current |
|---|---|---|
| **Primary brand** | `#6c44f6` (Larry 1.0) | `#6C5CE7` (globals.css:6) |
| **Difference** | — | Bluer, less saturated — visually distinct from the logo |

**Fix:** Change `--brand: #6c44f6` and derive `--brand-hover` as a 12% darker variant: `#5b38d4`.

### 0.2 Blue CTA Colour Has No Spec Basis

`--cta: #0073EA` appears in 50+ places (buttons, links, badges). The product spec says:
> "Both buttons have the Larry colour 1"

**Fix:** Replace `--cta` and `--cta-hover` with:
```css
--cta:       #6c44f6;
--cta-hover: #5b38d4;
```
This unifies brand and action colours per spec.

### 0.3 Full Colour Token Remap

Replace all design tokens with the official Larry palette:

```css
:root {
  /* Brand */
  --brand:         #6c44f6;   /* Larry 1.0 — logo, headlines, CTAs */
  --brand-hover:   #5b38d4;   /* Darkened Larry 1.0 */
  --brand-soft:    #e2d6fc;   /* Larry 3.0 — soft backgrounds, selected states */
  --brand-wash:    #f6f2fc;   /* Larry 5.0 — hover tints */

  /* CTA (unified with brand) */
  --cta:           #6c44f6;
  --cta-hover:     #5b38d4;

  /* Surfaces */
  --page-bg:       #f2f3ff;   /* Larry 4.0 */
  --surface:       #ffffff;   /* Larry 8.0 */
  --surface-2:     #f6f2fc;   /* Larry 5.0 */

  /* Borders */
  --border:        #e2d6fc;   /* Larry 3.0 — light */
  --border-2:      #bdb7d0;   /* Larry 6.0 — medium */

  /* Text */
  --text-1:        #11172c;   /* Larry 11.0 — primary */
  --text-2:        #4b556b;   /* Larry 10.0 — secondary */
  --text-muted:    #bdb7d0;   /* Larry 6.0 — muted */
  --text-disabled: #b7b8ba;   /* Larry 9.0 — disabled/sub */

  /* Accents */
  --accent-blue:   #bfd2ff;   /* Larry 7.0 — figures, illustrations */
  --accent-mid:    #b29cf8;   /* Larry 2.0 — secondary purple */
}
```

### 0.4 Status Colours (Derive from Larry Palette)

Replace Monday.com traffic-light colours with Larry-palette-derived tones:

```css
/* Status — Larry palette derived */
--status-not-started-bg:  #bdb7d0;   /* Larry 6.0 — neutral muted */
--status-not-started-text: #4b556b;  /* Larry 10.0 */

--status-in-progress-bg:  #b29cf8;   /* Larry 2.0 — active purple */
--status-in-progress-text: #ffffff;

--status-on-track-bg:     #bfd2ff;   /* Larry 7.0 — calm blue */
--status-on-track-text:   #11172c;   /* Larry 11.0 */

--status-at-risk-bg:      #d1b7c5;   /* Larry 12.0 — warm rose */
--status-at-risk-text:    #11172c;

--status-completed-bg:    #6c44f6;   /* Larry 1.0 — brand = done */
--status-completed-text:  #ffffff;

--status-overdue-bg:      #9a7fa7;   /* Larry 13.0 — muted plum */
--status-overdue-text:    #ffffff;
```

This keeps status visually distinguishable while staying entirely within the Larry palette. The hierarchy: completed = strongest (brand purple), in-progress = secondary purple, on-track = calm blue, at-risk = warm rose, overdue = dark plum, not-started = neutral.

### 0.5 Landing Page Font

**Spec:** "Use Inter as a font for the page"
**Current:** `.landing-page * { font-family: var(--font-geist-sans) !important; }`

**Fix:** Remove the Geist override on `.landing-page`. The body already uses Inter. Delete lines 109-112 from `globals.css`.

### 0.6 Auth Page Background Colour

**Current:** `bg-[#F7F7F4]` (warm gray, not in palette)
**Fix:** Change `(auth)/layout.tsx:5` to `bg-[#f2f3ff]` (Larry 4.0 page background).

### 0.7 Emoji Icons in Connectors Page

`ConnectorsPage.tsx` lines 37-40 use `"💬"`, `"📅"`, `"📧"` as connector icons.

**Fix:** Replace with Lucide SVG icons:
- Slack: `<MessageSquare />` or a Slack SVG brand icon
- Google Calendar: `<Calendar />`
- Outlook Calendar: `<Calendar />`
- Email: `<Mail />`

---

## P1 — Missing Core Surfaces

### 1.1 Sign-Up Onboarding Wizard

**Spec describes 10 steps.** Current: single email+password form.

**What to build:**

| Step | Content | Component |
|---|---|---|
| 1 | Welcome splash — "Welcome to Larry" + description + "Get started" + step dots | `WelcomeSplashStep` |
| 2 | Create account — email-first OR Google sign-up | `CreateAccountStep` |
| 3 | Email verification — code input | `VerifyEmailStep` |
| 4 | Profile — full name, photo upload, password (strength meter + eye toggle + confirm) | `ProfileStep` |
| 5 | Subscriptions + T&C checkboxes | (part of ProfileStep) |
| 6 | Role — selectable tiles (Team member, Manager, Director, etc.) | `RoleStep` |
| 7 | Work type — selectable tiles (Administrative, Engineering, etc.) | `WorkTypeStep` |
| 8 | Discovery — "How did you hear about Larry?" tiles | `DiscoveryStep` |
| 9 | Tools — "What tools do you use?" logo tiles | `ToolsStep` |
| 10 | Invite colleagues — email input + share link | `InviteStep` |
| 11 | "You're good to go" — redirect to workspace | `CompletionStep` |

**UX requirements from spec:**
- Step dots at bottom showing progress
- Consistent Larry colour 1 for "Continue" buttons
- Logo tile selection (like ClickUp's onboarding)
- Password strength indicator: Weak / Moderate / Strong
- Eye icon to toggle password visibility
- "Other" option with free-text input on role/work/discovery steps

### 1.2 Calendar View (Global + Per-Project)

**Spec:** "A normal calendar overview — should gather all information from your other calendars, outlook, gmail etc. Also gathers deadlines."

**What to build:**
- Full monthly calendar component at `/workspace/calendar`
- Also available as a tab within each project
- Shows: events from connected calendars + task deadlines + meeting notes post-meeting
- After a meeting, meeting minutes appear in the calendar booking
- Add "Calendar" to sidebar nav (between "Meetings" and "Documents")

**Design direction:** Full monthly grid with dot indicators for events, click to expand day. Clean, minimal — think Apple Calendar or Notion calendar, not Google Calendar complexity. Use Larry palette: brand purple for meetings, accent blue for deadlines, soft purple for all-day events.

### 1.3 Timeline View (Per-Project Tab)

**Spec:** "Timeline at the top, scale depends on project duration, possible to zoom in and out. Left column with Tasks/Group. Multiple levels: Group > Sub-group > Task > Sub-task."

**Decision:** Linear-style timeline (simpler, more usable than full Gantt).

**What to build:**
- Horizontal time axis with smart scale (days/weeks/months based on project span)
- Left column: collapsible task groups with indent levels
- Bars: coloured by status (using new Larry-derived status colours)
- Two layout options per spec: status colour dot after task name OR full bar in status colour (add toggle)
- Click a bar → detail panel slides in from right (task name, assignee, status, priority, dates, dependencies, action required)
- Milestone markers: small diamond shapes on timeline
- Filtering: by status, by assignee
- Sorting controls

### 1.4 External Content Import (Project Creation Method 4)

**Spec:** "Let Larry extract and structure your project from a document, presentation, email, message, or image."

**What to build:**
- 4th tab in `WorkspaceProjectIntake`: "Start from external content" / "Import"
- File upload zone accepting `.pdf`, `.docx`, `.xlsx`
- Upload → server extracts text → feeds to Larry Intelligence → returns bootstrap structure
- Same review/finalize flow as the chat intake mode

### 1.5 Email Draft UI

**Spec:** "Larry should be able to draft emails, messages, and calendar invites, and request user approval before sending."

API exists (`/api/workspace/email/drafts` + `/send`). No UI.

**What to build:**
- Email draft cards in the Action Centre (alongside task suggestions)
- Draft preview with To/Subject/Body
- Approve → sends via API
- Edit → opens inline editor
- Dismiss → discards draft

### 1.6 Task Dependencies UI

**Spec:** "When one task is done, an automatic notification goes out to the person responsible for the next task."

**What to build:**
- In `TaskDetailDrawer`: show "Depends on" and "Blocks" fields
- In Timeline view: optional dependency arrows between bars
- Dependencies editable from task detail

### 1.7 Report Export from Dashboard

**Spec:** "The option to export statistics to a file (PPT, Excel, PDF)"

**What to build (MVP):**
- "Export" button on `ProjectDashboard`
- Client-side PDF generation using html2canvas + jsPDF
- Captures the dashboard donut chart, status breakdown, and progress bar
- Defer PPT/Excel to a later phase

### 1.8 Team Tree View

**Spec:** "Perhaps have the option to see them as a tree? But then you need to put in information about who is above who."

**What to build:**
- In `CollaboratorsPanel`: toggle between list view (current) and org-tree view
- Tree requires a `reportsTo` field on team members
- Click a person → detail panel with name, picture, role, email, "send message"

---

## P2 — Partial Implementations (Behaviour Divergence)

### 2.1 Top Bar Auto-Hide

**Current:** Static 48px bar, always visible.
**Spec + confirmed:** Should auto-hide and reappear on hover.

**Fix:**
- Track mouse Y position
- When idle >2s and mouse is not in top 48px zone, slide bar up (`transform: translateY(-100%)`)
- When mouse enters top 60px, slide back down with 200ms ease-out
- Keep visible while any dropdown/popover from the bar is open

### 2.2 Breadcrumb Not Rendered

`WorkspaceTopBar.tsx` defines a `Breadcrumb` component (lines 15-73) but **never renders it**. The JSX only shows hamburger + notification bell.

**Fix:** Add `<Breadcrumb workspaceName={workspaceName} />` to the header JSX, positioned after the hamburger button. The spec says "the arrow to the left and 'project' should be more to the right" — add left margin/padding to the breadcrumb.

### 2.3 Project Overview Tab Bar

**Spec:** `Overview - Timeline - Task center - Action center - Calendar - Dashboard - Files - Team - Settings`

**Current:** `ProjectWorkspaceView` exists but the full tab bar with all sections is not implemented as described.

**Fix:** Add a horizontal tab bar at the top of the project view with all 9 tabs. Each tab routes to a sub-view. Some views exist (dashboard, action centre, team). Missing: Timeline, Calendar, Files, per-project Settings.

### 2.4 Action Centre Layout

**Spec:** "Left side: tasks needing more context or Larry asks questions. Then approval/confirmation. Far right: log of all actions."

**Current:** Two-column layout (pending review + recent activity). Missing the "questions" column and the full action log.

**Fix:**
- Add a left column for "Needs more context" (items where Larry is asking clarifying questions)
- Middle: current pending approval section
- Right: full chronological action log with expand/collapse for detail
- Add risk category badges (Low/Medium/High) to each action headline

### 2.5 Project Card Feedback

**Spec (Website feedback):** "Possible to make the colour of the progress a bit softer? Like dark grey or some shade of purple/grey."

**Current:** Progress bar uses `#6c44f6` (hard brand purple).

**Fix:** Use `#b29cf8` (Larry 2.0, softer purple) for progress bars. Reserve full brand purple for completed/CTA states.

### 2.6 New Project Button Position

**Spec:** "I might want the 'New project' on top to the right, since if you have a lot of projects you will otherwise need to scroll down."

**Current:** "New Project" button is centered below the header, which is fine for few projects but problematic at scale.

**Fix:** Move "New Project" to the top-right of the header row, aligned with "Your projects" heading.

### 2.7 Sidebar "Calendar" Nav Item Missing

**Spec:** Sidebar should have `Projects, My tasks, Action center, Calendar, Documents, Chats, Settings`.

**Current sidebar nav:** Home, My work, Actions, Meetings, Documents, Chats, Ask Larry, Settings.

**Fixes:**
- Add "Calendar" between "Meetings" and "Documents"
- Rename "My work" → "My tasks" to match spec language
- Consider whether "Meetings" and "Calendar" should be separate (spec lists Calendar but not Meetings as a sidebar item — meetings are viewed within Calendar)

### 2.8 Login Page — Password Eye Toggle

**Spec:** "There should be an 'eye' in the end of the field where you type in your password, when you click on it you shall see the password."

**Current:** No eye toggle on either login or signup pages.

**Fix:** Add an `<Eye>` / `<EyeOff>` Lucide icon button inside the password input. Toggle between `type="password"` and `type="text"`.

---

## P3 — Polish / Fit-and-Finish

### 3.1 Inconsistent Border Radius

- Workspace cards: `--radius-card: 12px`
- Action centre cards: `rounded-[18px]` (hardcoded)
- Auth cards: `rounded-3xl` (24px)

**Fix:** Standardize on `--radius-card: 12px` everywhere. The 18px/24px values create visual inconsistency.

### 3.2 Button Style Split

- Auth pages: outlined pill buttons (`rounded-full border border-neutral-900`)
- Workspace: filled rounded buttons (`pm-btn-primary`)

**Fix:** Auth buttons should use the same design system. Primary: filled with Larry 1.0 background. Secondary: outlined with Larry 1.0 border. Both use `border-radius: var(--radius-btn)` (8px), not full pill radius.

### 3.3 Text Colour Hardcoding

Many components use Tailwind neutral classes (`text-neutral-900`, `text-neutral-400`) instead of design tokens. This creates drift from the Larry palette.

**Fix:** Replace all `text-neutral-*` and `bg-neutral-*` with token references:
- `text-neutral-900` → `text-[var(--text-1)]`
- `text-neutral-600` → `text-[var(--text-2)]`
- `text-neutral-400` → `text-[var(--text-muted)]`
- `bg-neutral-50` → `bg-[var(--surface-2)]`

### 3.4 Landing Page Effects Conflict with Feedback

**Website feedback sheet:** "Change the background, no slow moving mouse. No dots."

**Current:** `CustomCursor`, `LiquidBackground`, `MagneticFieldBackground`, `InteractiveBackground` — all active on landing page.

**Fix:** Remove or gate `CustomCursor` (the "slow moving mouse" effect), `MagneticFieldBackground`, and any dot-grid rendering. Keep subtle gradient ambient effects only.

### 3.5 Logo Font (Manrope)

The spec says the logo font is **Manrope**, but the logo is rendered as a PNG image (`Larry_logos.png`), so this is fine. However, if any text elsewhere renders the word "Larry" as text (not image), it should use Manrope. Currently Manrope is not loaded — add it as a Google Font if needed.

---

## Implementation Priority Order

| Phase | Items | Impact |
|---|---|---|
| **Phase 1: Colour & Token Audit** | 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 3.1, 3.2, 3.3 | Every page immediately looks "Larry" instead of "generic PM tool" |
| **Phase 2: Auth & Onboarding** | 1.1, 2.8 | First-run experience matches product vision |
| **Phase 3: Workspace Shell** | 2.1, 2.2, 2.3, 2.6, 2.7 | Navigation and layout match spec |
| **Phase 4: Project Views** | 1.3, 1.6, 2.4, 2.5 | Timeline + dependencies + action centre layout |
| **Phase 5: Calendar** | 1.2 | Full monthly calendar component |
| **Phase 6: Content & Export** | 1.4, 1.5, 1.7, 1.8 | Import, email drafts, PDF export, team tree |
| **Phase 7: Landing Cleanup** | 3.4, 3.5 | Remove conflicting effects per feedback |

---

## File Impact Summary

| File | Changes |
|---|---|
| `globals.css` | Full token remap (P0), remove Geist override, update all status/pill classes |
| `(auth)/layout.tsx` | Background colour fix |
| `(auth)/login/page.tsx` | Eye toggle, button style, token colours |
| `(auth)/signup/page.tsx` | Replace with multi-step wizard |
| `Sidebar.tsx` | Add Calendar nav, rename My work → My tasks |
| `WorkspaceTopBar.tsx` | Auto-hide behaviour, render breadcrumb |
| `WorkspaceHome.tsx` | Move New Project button, softer progress bar |
| `ProjectWorkspaceView.tsx` | Add full tab bar (9 tabs) |
| `ConnectorsPage.tsx` | Replace emoji with SVG icons |
| `actions/page.tsx` | 3-column layout, risk badges |
| **New files needed** | `CalendarPage.tsx`, `TimelineView.tsx`, `TaskDependencyPanel.tsx`, onboarding wizard steps (6-8 components), `FileImportIntake.tsx`, `EmailDraftCard.tsx`, `ExportButton.tsx` |
