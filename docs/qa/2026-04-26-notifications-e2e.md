# Notifications Framework — E2E Trace
**Date:** 2026-04-26
**Branch:** master @ 7f7789f
**Test user:** launch-test-2026@larry-pm.com

## Status

Playwright MCP was not available in this session (session started before MCP was registered — see TESTING.md caveat). E2E flows require a Claude Code restart to register the Playwright MCP tools.

## Flows to verify on next Playwright session

### Flow A — Task created → banner → deep-link
1. Log in as `launch-test-2026@larry-pm.com`
2. Navigate to an existing project, create a task
3. Assert: banner "Task created: <name>" appears within 5s (via 20s poll — banner fires from poll, not from mutation response since task creation doesn't return `notification` yet)
4. Click banner → assert navigation to `/workspace/projects/<pid>/tasks/<tid>`
5. Screenshot

**Note:** Instant banner (via notify()) only fires for Larry action accepts/let-execute. Task creation still uses the 20s poll path.

### Flow B — Larry action accepted → banner fires in ~100ms
1. Navigate to `/workspace/actions`
2. Accept any suggested action
3. Assert: banner "Action executed" (or action-specific title from registry) appears within ~100ms (immediate, via notify() in useLarryActionCentre)
4. Click banner → assert navigation to the action's deep link
5. Screenshot

### Flow C — Invite accepted → cross-session banner within 20s
1. Session 1: invite a second email from `/workspace/settings/members`
2. Session 2: open invite link, accept
3. Back in Session 1: within 20s the poll fires — assert broadcast banner appears
4. Broadcast banner filtered: only visible to Session 1 user if their memberships.created_at predates the notification (OQ2 fix)
5. Click banner → assert navigation to `/workspace/settings/members`
6. Screenshot both sessions

## Pre-flight checklist before running flows

- [ ] Wait for Railway deploy: `railway logs --service larry-site -f` or check `gh run list`
- [ ] Set `NEXT_PUBLIC_NOTIFICATIONS_V2_ENABLED=true` on Vercel (Task 19b) — banners won't show until flag is flipped
- [ ] Confirm 034 migration ran on Railway: check Railway logs for "pg_cron job notify-ui-retention scheduled" or "pg_cron not available"
- [ ] Check for BotID issues: see memory `larry-botid-blocks-headless-playwright.md`
