# Larry Next Step Implementation Plan

## Source of Truth Check (Repo vs Plan)

Based on `docs/LARRY-INTELLIGENCE-PLAN.md` and current code state, the repo is ahead of parts of the narrative plan.

- Done: `runIntelligence(...)` exists in `packages/ai/src/intelligence.ts`.
- Done: executor functions (`runAutoActions`, `storeSuggestions`, `executeAction`) live in `packages/db/src/larry-executor.ts`.
- Done: chat endpoint exists at `POST /v1/larry/chat` in `apps/api/src/routes/v1/larry.ts`.
- Done: briefing endpoint exists at `GET /v1/larry/briefing` in `apps/api/src/routes/v1/larry.ts`.
- Done: event lifecycle endpoints exist (`GET /v1/larry/events`, `POST /v1/larry/events/:id/accept`, `POST /v1/larry/events/:id/dismiss`).
- Done: worker scheduled scan exists (`larry.scan`) in `apps/worker/src/worker.ts`.
- In progress: transcript ingestion path migration from `/v1/ingest/transcript` to `/v1/larry/transcript`.
- Not done: legacy tables (`agent_runs`, `agent_run_transitions`, `extracted_actions`, `interventions`) are still present in `packages/db/src/schema.sql` and not dropped.

## Phase Status

- Phase 1 (LarryIntelligence): completed.
- Phase 2 (LarryExecutor): completed (implemented in `packages/db`, not `apps/api/services`).
- Phase 3 (Chat -> Intelligence -> Execute): completed.
- Phase 4 (Login Briefing): completed.
- Phase 5 (Inline Project Actions): largely completed (hooks/routes and inline rail exist).
- Phase 6 (Scheduled Intelligence Worker): completed.
- Cleanup/Removal phase: not completed.

## Slice Log

### Slice 2026-03-29-A (implemented)

Goal: implement the next missing endpoint from the plan contract.

Implemented:
- Added `POST /v1/larry/transcript` in `apps/api/src/routes/v1/larry.ts`.
- Endpoint behavior mirrors existing transcript ingest flow:
  - canonical transcript event persisted via ingest pipeline
  - meeting note persisted
  - best-effort intelligence run for project-scoped transcript
  - auto-actions executed and suggestions stored
  - audit log written (`larry.transcript`)
- Updated web proxy route `apps/web/src/app/api/workspace/meetings/transcript/route.ts` to call `/v1/larry/transcript`.
- Added API tests in `apps/api/tests/larry-chat.test.ts` for the new transcript endpoint.

Validation run:
- `npm run test -w @larry/api -- larry-chat.test.ts` passed.

## Next Smallest Slice (recommended)

### Slice 2026-03-29-B (next)

Goal: complete transcript API migration and remove stale contract drift.

Plan:
1. Add compatibility shim in `/v1/ingest/transcript` that delegates to shared transcript handler (or mark as deprecated with consistent response).
2. Update any remaining internal callers/docs to use `/v1/larry/transcript`.
3. Add one integration test asserting both paths remain behaviorally consistent while migration is active.
4. Update `docs/LARRY-INTELLIGENCE-PLAN.md` API endpoint section to reflect implemented state and compatibility window.

Definition of done:
- No active web caller depends exclusively on `/v1/ingest/transcript`.
- Both endpoint contracts are documented and tested.

## Notes

- This repo currently has no `codex/implement-next-step` branch checked out locally (current branch observed: `master`).
- If branch-level slice commits are required, switch/create that branch before the next slice.
