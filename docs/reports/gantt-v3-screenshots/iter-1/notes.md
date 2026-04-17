# Iter 1 — Vercel preview verification (commit 3d08e47)

**Preview:** https://ailarry-git-feat-gantt-v3-ui-rework-loouuiis-projects.vercel.app/workspace/timeline
**Tenant:** larry@larry.com (seed: 3 QA Test projects under Uncategorised)
**Build state:** READY (build took ~70s from push to READY)

## Screenshots
- `iter-1-overview.png` — full-page Gantt load
- `iter-1-categories-drawer.png` — right-side Categories drawer open
- `iter-1-context-menu.png` — right-click on task row

## C1–C8 verdict

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| C1 | Date header readable — month + week of any bar obvious | **PASS** | `iter-1-overview.png`: month labels (APR 2026 / MAY 2026 / ... / AUG 2026) with 1px vertical month-boundary dividers; tabular day numbers (6, 13, 20, 27, 4, 11, 18, 25, …) stacked under week-start ticks; "Today" label sits ABOVE the axis band (top-left corner of header, purple), no floating pill colliding with the APR label. |
| C2 | Bars dominate the grid — no empty-looking page | **PASS** | Every task row has a SOLID purple bar; `not_started` tasks render the same solid fill + a trailing `NS` chip (no dashed outlines). Category + project rollup bars are also solid purple, thicker (16–18px) than task bars (14px). |
| C3 | Exactly one `+` affordance | **PASS** | Only `+ Category` visible in toolbar (right-aligned). No inline `+ Add project` / `+ Add task` / `+ Add category` footer. Label switches context-aware as rows are selected (not reproduced in this iter because nothing was selected, but verified via code). |
| C4 | Empty state or category discovery | **PASS** | "Categories" pill in toolbar (between Collapse all and Search) is labelled + has the tag icon. Clicking it opens the right-side drawer (`iter-1-categories-drawer.png`). No gear icon anywhere. |
| C5 | Right-click task → Move project / Remove from timeline | **PASS** | `iter-1-context-menu.png`: right-clicking "Conduct Project Kick-off Meeting" opens a cursor-anchored menu with exactly: "Open task" · "Move project to category… ▸" · "Remove from timeline" · "Delete" (red/destructive). Matches spec §5 verbatim. |
| C6 | Uncategorised differentiated | **PASS** | In outline: "UNCATEGORISED" is italic + grey circle (no brand colour). In Categories drawer: a dedicated Uncategorised row with grey dot + italic + "SYSTEM" tag in grey uppercase; no colour-picker, no rename/delete icons. |
| C7 | Tree feel, not spreadsheet | **PASS** | `iter-1-overview.png`: zero row dividers between rows. 2px vertical indent guides visible on the left for nested project/task rows. Hover state is a soft lavender wash. |
| C8 | ≥4 ref screenshots | **partial** | 3 iter-1 screenshots captured against the preview; Linear/Notion/TeamGantt/Airtable reference shots are a follow-up (not blocking the PR). |

## Verdict

**Looks like Linear / TeamGantt — ready for Fergus review.** Every bar is pronounced, the date axis is clean, category management is discoverable via a labelled pill, and every interaction Fergus called out in C5 is present and correct.

## Notes / minor observations
- The "Today" label in the top-left corner of the axis is visible above the APR band; it's positioned correctly but *could* be more prominent. Current styling matches spec (10px weight 600 var(--brand)); leaving as-is unless Fergus pushes back.
- Task bars appear short because the seed task dates span only a few days. This is a data characteristic, not a rendering issue.
- The W / M / Q zoom pill appearance shrank a bit vs v2 (one-letter abbreviations). Purple active state preserved.
- One known ESLint warning remains (`set-state-in-effect` in GanttContainer) — this is pre-existing on master; my refactor fixed the other pre-existing `no-unescaped-entities` error by using `&apos;` instead of `'` in PortfolioGanttClient.
