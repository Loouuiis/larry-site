# Larry - AI Runtime and Policy

## Pipeline Overview

```text
Channel signal (Slack / Calendar / Email / Transcript)
  -> canonical_events ingest
  -> source-aware prompt construction
  -> runIntelligence() in packages/ai
  -> runAutoActions() and storeSuggestions() in @larry/db
  -> larry_events ledger writes (auto_executed or suggested)
  -> user accept or dismiss for suggested actions
```

## Canonical Endpoints

- `POST /v1/larry/chat` - project-scoped chat turn, linked actions, and persisted messages
- `GET /v1/larry/briefing` - login briefing generation/read
- `GET /v1/larry/action-centre` - project/global action-centre read model
- `POST /v1/larry/events/:id/accept` - accept a suggested action and execute
- `POST /v1/larry/events/:id/dismiss` - dismiss a suggested action
- `POST /v1/larry/transcript` - canonical transcript ingest path

Compatibility note:
- `POST /v1/ingest/transcript` remains a deprecated shim to `POST /v1/larry/transcript`.

## Policy Behavior

Auto execution is allowed when intent is clear and safe for governed action classes.
Actions that are unclear, higher impact, or externally visible stay suggested until accepted.

Every persisted Larry event should remain explainable to users:
1. What was done or proposed (`display_text`)
2. Why (`reasoning`)
3. Where it came from (`source_kind` and `source_record_id`)
4. Who requested, approved, dismissed, or executed it when applicable

## Core Data Surfaces

- `canonical_events` - normalized source ingest ledger
- `larry_conversations` and `larry_messages` - chat history and actor-attributed turns
- `larry_events` - action ledger with lifecycle and provenance
- `larry_briefings` - generated login briefings
- `correction_feedback` - user correction records

## Key Files

- `packages/ai/src/intelligence.ts`
- `packages/db/src/larry-executor.ts`
- `apps/api/src/routes/v1/larry.ts`
- `apps/worker/src/canonical-event.ts`
