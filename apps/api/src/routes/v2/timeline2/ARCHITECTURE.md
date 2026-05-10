# Timeline 2 Backend Map

This folder is the canonical backend home for `Timeline 2`, `Task Center 2`, and `Timeline 2 AI2`.

## Where To Work

- CRUD, sample seeding, manual edits:
  `manual/` entrypoints and [manual-routes.ts](./manual-routes.ts)
- Branch review and accept/reject flow:
  `branches/` entrypoints and [branch-routes.ts](./branch-routes.ts)
- AI / AI2 route registration:
  `ai/` entrypoints
- Shared contracts and route wiring:
  [contracts.ts](./contracts.ts) and [route-context.ts](./route-context.ts)
- Current domain core:
  [index.ts](./index.ts)

## AI Paths

- `AI2` is the primary maintained planning path.
- Legacy `AI` remains available only as a compatibility route until removal is safe.
- If you are changing the planner, SSE behavior, request tracing, or proposal creation flow, start in `ai/` and then follow the referenced domain helpers in [index.ts](./index.ts).

## Domain Core In `index.ts`

`index.ts` still contains the main Timeline 2 domain implementation:

- snapshot and rollup generation
- revisions and branch persistence
- node/dependency validation
- scheduling and critical-path logic
- legacy AI proposal generation
- AI2 planning loop and operation staging

That is intentional for now: the route boundaries are explicit, while the deeper domain split remains a follow-up cleanup.
