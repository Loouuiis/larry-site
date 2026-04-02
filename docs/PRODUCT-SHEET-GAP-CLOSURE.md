# Product Sheet Gap Closure Plan

## Branch: `codex/implement-next-step`

**Date:** 2026-04-02
**Scope:** Backend-only fixes to close every gap between the product sheet and the current implementation. No UI changes.

---

## Current State Summary

After comparing the product sheet against the deployed codebase, most features already exist:

| Feature | Status |
|---|---|
| Task CRUD (create, manage, update) | ✅ Working |
| Auto vs Suggested actions (risk-based) | ✅ Working |
| Project context retention (memory) | ✅ Working |
| Per-project + global chat | ✅ Working (global fans out across 5 projects) |
| Login briefing | ✅ Working (4-hour cache) |
| Inline project actions (action centre) | ✅ Working |
| Scheduled scan (every 4 hours) | ✅ Working |
| Action log with attribution | ✅ Working (larry_events full audit trail) |
| Calendar sync (Google + Outlook) | ✅ Connectors exist |
| Read emails/messages/calendar → update project | ✅ Canonical event pipeline |
| Draft emails + calendar events with approval | ✅ Action types exist |
| Document generation (.docx, .xlsx, .pptx) | ✅ All three formats |
| Autonomy settings (confidence thresholds) | ✅ tenant_policy_settings |
| Manual rules for Larry | ⚠️ Stored + loaded, but LLM prompt ignores them |
| Clarification before acting | ⚠️ Hardcoded regex only, not LLM-driven |
| Learning from feedback | ⚠️ Corrections passed to LLM but prompt has no instructions |
| Source tagging (Meeting/Chat/Slack/Manual) | ⚠️ Mapping mismatch |
| Draft Slack messages | ❌ Missing action type |
| Meeting attendance + recording | ❌ Transcript ingestion only |

---

## Gap 1: Feedback Learning Loop in Intelligence Prompt

**Problem:** `correction_feedback` rows are loaded and appended to the LLM hint via `buildRulesAndCorrectionsHint()`, but:
- The system prompt in `intelligence.ts` has zero instructions about how to interpret or use corrections
- The correction format is raw JSON dumps, not human-readable guidance
- The LLM has no concept of "reinforce accepted patterns" or "avoid dismissed patterns"

**Fix:**

### 1a. Add FEEDBACK LEARNING section to system prompt (`packages/ai/src/intelligence.ts`)

Add a new section after the existing RULES section in `buildSystemPrompt()`:

```
## FEEDBACK LEARNING
When PAST CORRECTIONS are included in the context, use them to calibrate your actions:
- "accepted" corrections mean the user approved that type of action — lean towards similar actions in the future
- "dismissed" corrections mean the user rejected that type of action — avoid proposing similar actions unless signals are very strong
- Patterns matter more than individual entries — if 3 of the last 5 task_create suggestions were dismissed, reduce task_create suggestions
- Never reference corrections in your briefing text. Use them silently to shape your judgment.
- If USER-DEFINED RULES are present, they override correction patterns. Rules are explicit; corrections are heuristic.
```

### 1b. Improve correction formatting in `buildRulesAndCorrectionsHint()`

Change the corrections format from raw JSON to structured summaries:
```
Past user feedback — use this to calibrate:
1. ACCEPTED: task_create (2026-03-30) — user approved creating tasks from chat
2. DISMISSED: deadline_change (2026-03-29) — user rejected deadline modifications
3. ACCEPTED: risk_flag (2026-03-28) — user approved risk flagging
```

**Files to modify:**
- `packages/ai/src/intelligence.ts` — add FEEDBACK LEARNING section to `buildSystemPrompt()`
- `apps/api/src/routes/v1/larry.ts` — improve `buildRulesAndCorrectionsHint()` formatting

---

## Gap 2: LLM-Driven Follow-Up Questions

**Problem:** The product sheet says: "Larry asks follow-up questions before executing any action... interactions are conversational and interactable, not one-shot and go."

Currently, `detectClarificationNeed()` handles 4 hardcoded cases via regex:
- Missing task details on create
- Missing date on deadline change  
- Missing assignee on owner change
- Ambiguous/missing task target

This misses nuanced scenarios the LLM could handle (e.g., "scope change but what exactly should change?", "email draft but who to?", "calendar event but when?").

**Fix:**

### 2a. Add `follow_up_question` to the intelligence output schema

Extend `IntelligenceResult` to include an optional `followUpQuestions` array:

```typescript
// In packages/shared/src/index.ts
export interface IntelligenceResult {
  briefing: string;
  autoActions: LarryAction[];
  suggestedActions: LarryAction[];
  followUpQuestions?: Array<{
    field: string;      // "deadline" | "assignee" | "scope" | "recipient" | "general"
    question: string;   // "What deadline should I set for this task?"
  }>;
}
```

### 2b. Update the intelligence system prompt

Add a new section:

```
## FOLLOW-UP QUESTIONS
When the user's request is ambiguous or missing critical information needed to act, you MAY include followUpQuestions in your response INSTEAD of guessing.

Return followUpQuestions when:
- The user asks to do something but key details are missing (who, what, when, where)
- The request could apply to multiple entities and you cannot determine which
- The scope of a change is unclear

Do NOT ask follow-up questions when:
- The snapshot has enough data to determine the right action
- The request is a simple status query (just answer it in the briefing)
- You are running on a schedule or login trigger (no one to ask)

When followUpQuestions is non-empty, autoActions and suggestedActions SHOULD be empty (don't act AND ask at the same time).
```

### 2c. Update Zod schema in intelligence.ts

Add optional `followUpQuestions` to `IntelligenceResultSchema`.

### 2d. Update chat handler in larry.ts

When intelligence returns `followUpQuestions`, return them as `requiresClarification: true` with the structured questions — similar to how `detectClarificationNeed` already works, but LLM-driven.

**Files to modify:**
- `packages/shared/src/index.ts` — extend `IntelligenceResult` type
- `packages/ai/src/intelligence.ts` — update schema + system prompt + mock
- `apps/api/src/routes/v1/larry.ts` — handle `followUpQuestions` in chat handler

---

## Gap 3: Rules Enforcement in System Prompt

**Problem:** `larry_rules` rows are loaded from DB, formatted by `buildRulesAndCorrectionsHint()`, and appended to the hint. But the system prompt has no section explaining what rules are or how to apply them.

**Fix:**

Add a USER-DEFINED RULES section to `buildSystemPrompt()`:

```
## USER-DEFINED RULES
When USER-DEFINED RULES are included in the context, they are explicit instructions from the project owner.
- Rules override your default judgment. If a rule says "never auto-execute reminders", obey it even if your rules say reminders are auto-execute.
- Rule types:
  - "behavioral": changes how Larry acts (e.g., "always suggest, never auto-execute")
  - "scope": limits what Larry can touch (e.g., "do not modify tasks assigned to Joel")
  - "preference": stylistic (e.g., "always mention deadline in display text")
- If a rule conflicts with another rule, the more restrictive one wins.
- Never reference rules in your briefing text. Apply them silently.
```

**Files to modify:**
- `packages/ai/src/intelligence.ts` — add USER-DEFINED RULES section to `buildSystemPrompt()`

---

## Gap 4: Source Kind Tag Alignment

**Problem:** The product sheet specifies source tags: Meeting, Direct Chat, Slack, Review of Project Recommendation, Manual. The DB `source_kind` field on `larry_events` is populated from `triggered_by` which uses: schedule, login, chat, signal.

The UI's `SourceBadge.tsx` expects: slack, email, meeting, manual. There is a disconnect.

**Fix:**

### 4a. Enrich `source_kind` on larry_events during creation

When `runAutoActions()` and `storeSuggestions()` create larry_events, set `source_kind` based on richer context:

- `triggered_by: "chat"` → `source_kind: "direct_chat"`
- `triggered_by: "schedule"` → `source_kind: "project_review"` (this is the "Review of Project Recommendation" from the spec)
- `triggered_by: "login"` → `source_kind: "briefing"`
- `triggered_by: "signal"` → derive from canonical event source:
  - If the signal came from Slack → `source_kind: "slack"`
  - If the signal came from email → `source_kind: "email"`
  - If the signal came from calendar → `source_kind: "calendar"`
  - If the signal came from a transcript → `source_kind: "meeting"`

### 4b. Add `source_kind` to `actionContext` parameter

The `actionContext` object passed to `runAutoActions()` and `storeSuggestions()` already has `sourceKind`. Ensure the caller sets it correctly based on the trigger source.

### 4c. Allow `source_kind: "manual"` for manually created actions

When actions are created through a future "manual add" flow, tag with `source_kind: "manual"`.

**Files to modify:**
- `packages/db/src/larry-executor.ts` — use `actionContext.sourceKind` when inserting larry_events
- `apps/api/src/routes/v1/larry.ts` — set correct `sourceKind` in actionContext based on trigger
- `apps/worker/src/canonical-event.ts` — set correct `sourceKind` based on canonical event source
- `apps/worker/src/larry-scan.ts` — set `sourceKind: "project_review"` for scheduled scans

---

## Gap 5: Slack Message Draft Action Type

**Problem:** Product sheet says "Larry should be able to draft emails, messages, and calendar invites." Email drafts (`email_draft`) and calendar events exist, but there's no Slack message draft action type.

**Fix:**

### 5a. Add `slack_message_draft` to LarryActionType

```typescript
// In packages/shared/src/index.ts
export type LarryActionType =
  | ... existing types ...
  | "slack_message_draft";
```

### 5b. Add action type to intelligence system prompt

```
"slack_message_draft" [ACTION CENTRE ONLY]
  payload: { "channelName": string, "message": string, "threadTs": string|null }
```

### 5c. Add to Zod enum in intelligence.ts

Add `"slack_message_draft"` to `LarryActionTypeEnum`.

### 5d. Add executor in larry-executor.ts

```typescript
async function executeSlackMessageDraft(db, tenantId, projectId, payload, actorUserId) {
  // Store as a pending draft in a new slack_outbound_drafts table (or reuse existing pattern)
  // The actual send happens only after user approves in the action centre
}
```

### 5e. Add mock handler in intelligence.ts

Add pattern detection for Slack message intent in `mockIntelligence()`.

**Files to modify:**
- `packages/shared/src/index.ts` — add type
- `packages/ai/src/intelligence.ts` — add to Zod enum, system prompt, mock
- `packages/db/src/larry-executor.ts` — add executor function
- `packages/db/src/schema.sql` — add `slack_outbound_drafts` table (if needed)

---

## Gap 6: Meeting Transcript Intelligence Enhancement

**Problem:** Product sheet says "Larry should be able to attend all meetings and record them, generate structured outputs including meeting minutes, summaries, and next steps, and convert these into tasks."

Currently:
- `POST /v1/larry/transcript` accepts transcripts and processes them through the canonical event pipeline
- The canonical event handler runs intelligence and extracts actions
- But the intelligence prompt has no specific instructions for meeting transcript processing

Meeting **attendance and recording** requires third-party service integration (Recall.ai, Fireflies, etc.) which is out of scope for this code-level fix. But we can ensure that when transcripts arrive, the intelligence extracts **meeting minutes, summaries, and next steps** properly.

**Fix:**

### 6a. Add MEETING TRANSCRIPT section to system prompt

When the hint contains "signal: transcript:", add specific extraction instructions:

```
## MEETING TRANSCRIPT PROCESSING
When processing a meeting transcript signal:
1. Generate a structured summary in the briefing field:
   - Key decisions made
   - Action items identified (who, what, when)
   - Open questions or unresolved items
2. For each action item:
   - Create a task_create suggestedAction with assignee, deadline (if mentioned), and description
3. For follow-ups mentioned:
   - Create calendar_event_create suggestedActions for any mentioned follow-up meetings
4. For external communications mentioned:
   - Create email_draft suggestedActions for any emails the team committed to sending
```

### 6b. Improve transcript hint format

When the canonical event handler processes a transcript, format the hint with clear structure so the LLM can parse it effectively.

**Files to modify:**
- `packages/ai/src/intelligence.ts` — add meeting transcript section to system prompt
- `apps/worker/src/canonical-event.ts` — improve transcript hint formatting

---

## Implementation Order

All 6 gaps are independent — they can be implemented in parallel by separate agents.

| Gap | Agent | Primary Files |
|-----|-------|---------------|
| 1. Feedback Learning | Agent A | `intelligence.ts`, `larry.ts` |
| 2. LLM Follow-Up Questions | Agent B | `shared/index.ts`, `intelligence.ts`, `larry.ts` |
| 3. Rules Enforcement | Agent C | `intelligence.ts` |
| 4. Source Kind Tags | Agent D | `larry-executor.ts`, `larry.ts`, `canonical-event.ts`, `larry-scan.ts` |
| 5. Slack Message Draft | Agent E | `shared/index.ts`, `intelligence.ts`, `larry-executor.ts`, `schema.sql` |
| 6. Meeting Transcript | Agent F | `intelligence.ts`, `canonical-event.ts` |

**Note:** Gaps 1, 3, and 6 all modify `buildSystemPrompt()` in `intelligence.ts`. These must be coordinated — either done by one agent or merged carefully.

### Recommended grouping:
- **Agent 1 (Intelligence Prompt):** Gaps 1 + 3 + 6 (all system prompt changes in intelligence.ts)
- **Agent 2 (LLM Follow-Ups):** Gap 2 (schema + intelligence + chat handler)
- **Agent 3 (Source Tags):** Gap 4 (executor + routes + worker)
- **Agent 4 (Slack Drafts):** Gap 5 (new action type end-to-end)
