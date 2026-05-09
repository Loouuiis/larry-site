# Timeline 2 Frontend Map

This folder is the canonical frontend home for `Timeline 2`, `Task Center 2`, and the current `Timeline 2 AI` panel.

## Where To Work

- Page-level orchestration:
  [Timeline2ProjectTab.tsx](./Timeline2ProjectTab.tsx)
- Gantt rendering and timeline interactions:
  [Timeline2GanttSurface.tsx](./Timeline2GanttSurface.tsx)
- Task-center interactions and outline/status views:
  [TaskCenter2Surface.tsx](./TaskCenter2Surface.tsx)
- Drawer / node editing:
  [Timeline2NodeDrawer.tsx](./Timeline2NodeDrawer.tsx)
- Branch review:
  [Timeline2BranchReview.tsx](./Timeline2BranchReview.tsx)
- AI panel:
  [Timeline2AiPanel.tsx](./Timeline2AiPanel.tsx)
- Shared UI formatting and tree helpers:
  [timeline2-ui.ts](./timeline2-ui.ts)
- Transport boundary for Timeline 2 API and SSE:
  [../../../hooks/useTimeline2.ts](../../../hooks/useTimeline2.ts)

## Working Rules

- Start in `Timeline2ProjectTab.tsx` when the change affects screen composition or mode switching.
- Start in `useTimeline2.ts` when the change affects fetches, SSE parsing, conversation handling, or branch acceptance/rejection requests.
- Treat `Timeline2GanttSurface.tsx` and `TaskCenter2Surface.tsx` as feature surfaces, not generic component buckets.
- Keep user-facing labels stable for now even if internal names shift toward `AI2` as the primary planning path.
