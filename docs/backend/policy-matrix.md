# Action Policy Matrix (MVP)

This matrix applies to actions derived from Larry Workspace activity and connector-derived signals (Slack/Email/Calendar).

## Autonomous (no approval)

- Reminder nudges for inactive tasks
- Standup summary generation
- Weekly summary generation
- Non-critical status updates with confidence >= 0.75

## Approval required (Action Center)

- Deadline changes
- Ownership changes
- Scope changes
- Escalation drafts to leadership
- Any action with confidence < 0.75
- Any high-impact action

## Override behavior

- Every pending action can be approved, rejected, or overridden
- Overrides are persisted in `correction_feedback`
- Approval decisions are persisted in `approval_decisions`
- All decision mutations are written to `audit_log`
