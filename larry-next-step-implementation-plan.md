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

### Slice 2026-03-29-B (implemented)

Goal: keep legacy transcript endpoint safe while migrating callers to the Larry endpoint contract.

Implemented:
- Converted `POST /v1/ingest/transcript` in `apps/api/src/routes/v1/ingest.ts` into a compatibility shim.
- Shim now forwards requests to `POST /v1/larry/transcript` internally and returns upstream payload/status.
- Added explicit deprecation signaling:
  - response header: `x-larry-deprecated-endpoint: /v1/ingest/transcript`
  - response body fields: `deprecatedEndpoint`, `replacementEndpoint`
- Added API test coverage in `apps/api/tests/larry-chat.test.ts` for compatibility behavior.

Validation run:
- `npm run test -w @larry/api -- larry-chat.test.ts` passed.

### Slice 2026-03-29-C (implemented)

Goal: resolve CI TypeScript failure in transcript route tests.

Implemented:
- Updated `apps/api/tests/larry-chat.test.ts` mock payloads for `ingestCanonicalEvent` to match `IngestEventResult`.
- Removed invalid `rawEventId` field from mock resolved values.

Validation run:
- `npm run test -w @larry/api -- larry-chat.test.ts` passed (12/12).

## Next Smallest Slice (recommended)

### Slice 2026-03-29-D (next)

Goal: update docs and remove stale endpoint narratives so plan/docs match shipped behavior.

Plan:
1. Update `docs/LARRY-INTELLIGENCE-PLAN.md` endpoint section with implemented/current contracts.
2. Add a short deprecation note for `/v1/ingest/transcript` compatibility window.
3. Verify no web callers point to `/v1/ingest/transcript`.
4. Decide removal timing for shim after downstream clients migrate.

Definition of done:
- Docs match repo behavior for larry/ingest transcript flows.
- Deprecation path and removal criteria are explicit for the next agent.

## Notes

- This repo currently has no `codex/implement-next-step` branch checked out locally (current branch observed: `master`).
- If branch-level slice commits are required, switch/create that branch before the next slice.
