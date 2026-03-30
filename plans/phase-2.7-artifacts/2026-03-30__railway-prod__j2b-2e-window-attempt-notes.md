# Phase 2.7 J2b-2e Window Attempt Notes (Railway Prod)

- Date (UTC): `2026-03-30`
- Environment: `railway-prod`
- Tenant: `11111111-1111-4111-8111-111111111111`

## Deploy-Safe Sync Evidence

- API service (`larry-site`) redeployed with latest Phase 2.7 runner/gate code:
  - Deployment ID: `65d6d39d-a2d2-4589-86f7-3c6d7d23030a`
  - Status: `SUCCESS`
- Worker service (`diplomatic-vitality`) redeployed:
  - Deployment ID: `8fd8b154-c912-4f5f-8f07-55222b4637f0`
  - Status: `SUCCESS`
- `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT`:
  - `larry-site`: `<unset>`
  - `diplomatic-vitality`: `<unset>`

## Repo-Native Runner Evidence

- In-window precheck run:
  - `plans/phase-2.7-artifacts/2026-03-30T15-11-51-707Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.{json,md}`
  - `final_decision=precheck_blocked`
- Execute-mode run with explicit confirmation:
  - `plans/phase-2.7-artifacts/2026-03-30T15-14-55-535Z__railway-prod__phase-2-7-retirement-window-execute__11111111.{json,md}`
  - `plans/phase-2.7-artifacts/2026-03-30T15-14-55-535Z__railway-prod__phase-2-7-retirement-window-execute-precheck__11111111.{json,md}`
  - `final_decision=blocked`
  - `destructive_sql_executed=no`

## Blocking Reasons

1. Growth gate failure:
   - `new_chat_missing_source_record = 0`
   - `new_schedule_missing_source_record = 49`
   - `new_invalid_chat_linkage = 0`
2. FK baseline mismatch:
   - Expected A/B/C FK dependencies are absent in target environment:
     - `meeting_notes.agent_run_id -> agent_runs`
     - `email_outbound_drafts.action_id -> extracted_actions`
     - `correction_feedback.action_id -> extracted_actions`

## Outcome

- J2b-2e destructive execution did **not** run.
- No A/B/C/D/E destructive statements were executed.
- Dossier decision remains `blocked` pending growth-gate remediation/re-baseline and FK gate-policy alignment.
