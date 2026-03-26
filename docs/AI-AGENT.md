# Larry — AI Agent & Policy Engine

## Pipeline Overview

```
Channel signal (Slack / Calendar / Email / Transcript)
  ↓
Canonical Event (normalised, stored in canonical_events)
  ↓
extractActionableText()    — source-aware text extraction
  ↓
extractActions()           — LLM call → list of ExtractedAction proposals
  ↓
evaluateActionPolicy()     — confidence + impact gating
  ↓
Persist extracted_actions  — with reasoning, interventions, state
  ↓
APPROVAL_PENDING (human review) or EXECUTED (auto)
```

## Action Types

| Type | Description |
|------|-------------|
| `project_create` | Create a new project with seed tasks |
| `task_create` | Create a new task in a project |
| `task_update` | Update task status, priority, due date, or assignee |
| `email_draft` | Draft an outbound email for review |
| `follow_up` | Draft a follow-up message (Slack DM or email) |
| `meeting_invite` | Propose a calendar meeting invite |
| `reminder` | Nudge stakeholder on inactive task |
| `escalation` | Escalation draft to PM / manager |

## Policy Matrix

### Auto-executed (no approval)

- Reminder nudges for inactive tasks
- Standup summary generation
- Weekly summary generation
- Non-critical status updates with confidence ≥ 0.75

### Approval required (Action Centre)

- Deadline changes
- Ownership / assignee changes
- Scope changes
- Escalation drafts to leadership
- Any action with confidence < 0.75
- Any high-impact action

### Override behaviour

- Every pending action can be approved, rejected, or overridden
- Overrides persist in `correction_feedback` + `approval_decisions`
- All decisions write to `audit_log`

## Confidence & Threshold Tuning

- Default confidence threshold: `0.75`
- Tenant-level threshold overrides stored in `tenant_policy_settings`
- Correction feedback adjusts per-tenant thresholds over time
- `packages/ai` exports: `evaluateActionPolicy()`, configurable thresholds, `buildInterventionDecision()`, `buildActionReasoning()`

## Transparency Principles (per action)

Every extracted action must expose:
1. **What** — the action taken (action type + payload summary)
2. **Why** — reasoning string (1–3 sentences)
3. **Source** — originating signal excerpt (first ~200 chars) + channel/title + timestamp
4. **Override** — immediate approve / reject / correct controls

## Correction Feedback Loop

`POST /v1/agent/actions/:id/correct` — captures correction payload:
- What was wrong
- What the correct action should have been
- Optionally tunes tenant-level confidence threshold

Persisted to `correction_feedback` table.

## Key Files

| File | Purpose |
|------|---------|
| `packages/ai/src/index.ts` | `extractActions()`, `evaluateActionPolicy()`, confidence logic, reasoning builder |
| `packages/shared/src/index.ts` | `ExtractedAction`, `ActionReasoning`, `InterventionDecision`, `CorrectionFeedback` types |
| `apps/worker/src/worker.ts` | Calls extraction pipeline, persists actions, drives state machine |
| `apps/api/src/routes/v1/actions.ts` | Approval/reject/override handlers, execution dispatch |
| `apps/api/src/routes/v1/agent.ts` | Agent run creation, correction endpoint |

## Noise Filtering

Worker skips these Slack event subtypes — they do not produce agent runs:
`bot_message`, `channel_join`, `channel_leave`, `message_changed`, `message_deleted`
