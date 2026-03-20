# Larry Workspace — UI messaging (PDF-aligned)

This document keeps on-screen copy aligned with product positioning: **coordination layer for autonomous execution**, **real-time source of truth**, and **human approval for high-impact decisions**—not “generic AI assistant.”

## Core phrases (use / adapt)

- **Product**: Larry Workspace is the system of record for execution; channels (Slack, Calendar, Email) feed signals—Larry normalizes, proposes, and routes **approval-gated** actions.
- **Larry (coordination)**: Prefer “coordination commands,” “execution loop,” “Action Center”—avoid “chatbot” or “magic.”
- **Meeting → execution**: Transcripts become structured work; emphasize **extraction → review → approval**, not auto-pilot.
- **Action Center**: “Prepared for your approval” when an action touches deadline, scope, ownership, external commitments, or policy thresholds. Pair with **explainability**: confidence, threshold, signals (from API `reasoning` where present).

## Human vs autonomous (from product Q&A)

- **Autonomous / low-friction**: reminders, risk scoring, aggregation, reversible operational updates.
- **Human required**: strategy, accountability shifts, external/financial exposure—Larry **prepares**, the user **validates**.

## What we do not claim in UI (until shipped)

Do not imply: voice project setup, PDF/PPT export, full notification center, documents library, or meeting **recording**—unless the feature is wired end-to-end in `apps/web` + `apps/api`.

## Implementation surfaces

| Surface | Message emphasis |
|--------|---------------------|
| Home (`/workspace`) | Outcomes, execution coordination, recent boards, real activity |
| My work (`/workspace/my-work`) | Cross-project tasks; assignee filter when session + API provide `assigneeUserId` |
| Project board | PM-grade board; Larry entry in toolbar as **coordination**, not a floating gimmick |
| Right rail — Action Center | Approvals + “why” + correct/override path |

## Tone

- Confident, concise, PM-native (monday-grade density of language, not startup hype).
- Light purple + blue accents match brand PDF (“light purple” theme); avoid heavy gradients for primary chrome.
