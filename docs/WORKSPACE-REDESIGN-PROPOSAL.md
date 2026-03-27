# Larry Workspace Redesign Improvements

## Scope

This document is now a delta on top of [larry-workspace-expansion-plan-2026-03-27.md](C:/Users/oreil/Documents/larry-site/docs/larry-workspace-expansion-plan-2026-03-27.md).

It assumes that plan remains the execution baseline for:

- Larry being reachable across the workspace
- prompt-driven task creation and task closure becoming reliable
- Action Centre outcomes becoming clearer and more explicit

This document only covers the additional interface and product-structure improvements that make Larry feel more autonomous, fluid, and differentiated.

## What Is Not Repeated Here

The following are already well covered by the existing expansion plan, so they are intentionally not restated as primary workstreams here:

- mounting Larry inside the workspace shell
- strengthening the backend prompt -> task execution loop
- improving approval copy and action clarity in the Action Centre

Those are necessary, but they are not the higher-level redesign moves.

## Improvement Thesis

Once Larry is embedded into the workspace and the execution loop is dependable, the next gap is not capability. It is product expression.

Right now the workspace still reads like:

- a conventional PM app
- with a Larry surface attached

The improvement goal is to make it read like:

- a live operating system for project execution
- where Larry is already running coordination
- and the human is steering decisions, not maintaining the system manually

## Improvement Layer 1: Reframe The Information Architecture

### Current shape

The workspace still feels tool-shaped:

- Home
- My work
- Meetings
- Documents
- Chats
- Settings

### Improvement

Reframe navigation around Larry's execution loop:

- Brief
- Projects
- Decisions
- Memory
- Policies
- Connectors

### Product effect

This shifts the mental model from "where do I go to find a tool?" to "where do I go to steer execution?"

### Consequence for the existing plan

- `/workspace/chats` should become a history or deep-work surface, not the main daily Larry destination.
- `/workspace/actions` should become backlog/history, while approval handling moves closer to the main workspace.
- `/workspace/meetings` and `/workspace/documents` should eventually behave like filtered views of a broader memory layer.

## Improvement Layer 2: Replace The Home Grid With A Larry Brief

### Current shape

`/workspace` is still primarily a project-card overview.

### Improvement

Turn the default workspace landing page into a Larry Brief.

It should answer:

- what Larry already did
- what changed since the user last checked
- what is blocked
- what is waiting for approval
- which project needs attention now

### Recommended structure

- top: persistent command composer
- first band: "Larry already moved X things today"
- main column: project pulse and risk movement
- side column: decisions ready now
- lower band: live signal feed from meetings, Slack, email, and task movement

### Why this matters

This is the fastest way to make Larry feel like the product itself rather than a button in the product.

## Improvement Layer 3: Replace Project Tabs With A Continuous Project Canvas

### Current shape

The project experience is split into tabs:

- tasks
- timeline
- analytics
- meetings
- team
- documents

### Improvement

Replace the tabbed project workspace with one continuous execution canvas made of collapsible sections.

### Recommended section order

- project intent and target outcome
- execution runway: tasks, dependencies, timeline
- decisions affecting this project
- memory/evidence stream
- health and risk layer
- ownership and follow-through layer

### Why this matters

The product outline describes Larry as a real-time source of truth. A fragmented tab structure weakens that. A continuous canvas makes the project feel alive and connected.

## Improvement Layer 4: Move From Action Centre Page To Persistent Decision Rail

### Current shape

The Action Centre is useful, but it still behaves like a separate inbox.

### Improvement

Keep the Action Centre page, but make the primary interaction model a persistent decision rail or expandable side sheet that is visible from the main workspace surfaces.

### What belongs there

- approval-ready actions
- impact level
- confidence
- one-sentence why
- source provenance
- approve / revise / reject

### Why this matters

This turns approval from a separate admin step into the main steering mechanism of the product.

### Consequence for the existing plan

The existing Action Centre improvements should feed into reusable decision components, not only improve the standalone page.

## Improvement Layer 5: Unify Meetings, Chats, And Documents Into Memory

### Current shape

Meetings, chats, and documents are still presented as separate destinations.

### Improvement

Create a unified Memory layer where the user can see the evidence Larry is using.

### Memory should support

- filters by source type: meeting, Slack, email, document, manual note
- grouping by project
- trace from memory item -> generated task, action, or status change
- reverse trace from task/action -> original source

### Why this matters

This is where Larry becomes more trustworthy than a normal PM tool. The user stops seeing isolated artifacts and starts seeing how Larry is synthesizing reality.

## Improvement Layer 6: Upgrade Project Creation Into A Four-Mode Launchpad

### Current shape

Project creation is still mostly a manual form.

### Improvement

Rebuild project start as a launchpad with the four modes described in the product material:

1. Manual setup
2. Tell Larry by text or voice
3. Start from a meeting or transcript
4. Import from another source such as a document, deck, message thread, or image

### Each mode should explain

- what Larry will extract
- what structure Larry will create
- what still needs approval

### Why this matters

This is one of the clearest places where the current interface underplays the product vision. Fixing this makes Larry feel more revolutionary immediately.

## Improvement Layer 7: Add An Autonomy Policy Surface

### Current shape

Policy exists in docs and logic, but not as a first-class product surface.

### Improvement

Add an in-product policy drawer or settings surface that explains:

- what Larry can do automatically
- what always requires approval
- what thresholds are active
- what sources Larry is monitoring
- how corrections improve future behavior

### Why this matters

The outline is very strong on explainability, reversibility, and safe failure. That should be visible in the interface, not hidden in implementation.

## Improvement Layer 8: Make Provenance Native To The Main Canvas

### Current shape

Source context is strongest in approval flows, but weaker in normal task and project views.

### Improvement

Add provenance directly into the core execution surfaces:

- task rows
- timeline items
- risk cards
- status changes
- project updates

### Provenance examples

- from meeting transcript
- from Slack thread
- from email reply
- from imported document
- from Larry inference based on dependency graph

### Why this matters

The product gets stronger when every important change answers, "where did this come from?" without the user opening a second page.

## Improvement Layer 9: Make The Workspace Chrome More Fluid

### Current shape

The sidebar, top bar, and page chrome are readable but still static and screen-hungry.

### Improvement

Apply the product feedback more aggressively:

- top bar collapses or fades when idle
- command surface stays reachable without dominating the screen
- project chrome becomes lighter and less boxy
- more information fits on screen without feeling dense

### Why this matters

The product outline wants elegance, simplicity, and flow. The chrome should support that instead of competing with the work itself.

## Improvement Layer 10: Give Larry A More Distinctive Visual Language

### Current shape

The workspace is competent, but it still reads like a dark SaaS PM environment.

### Improvement

Move the product toward an "editorial mission control" visual direction.

### Recommended direction

- warm mineral base instead of flat dark workspace everywhere
- deep ink surfaces for Larry-owned panels
- muted lilac as the Larry accent
- amber/coral/mint/steel for execution states
- mono labels for evidence, confidence, and source metadata
- fewer generic cards, more structured rails and layered canvases

### Why this matters

If Larry is supposed to feel like a new category, it cannot look identical to a slightly upgraded project tracker.

## Recommended Post-Baseline Delivery Order

This sequence assumes the current expansion plan ships first.

### Phase A: Expression Shift

- Larry Brief on `/workspace`
- persistent decision rail
- stronger navigation model

### Phase B: Structural Shift

- continuous project canvas
- provenance embedded into tasks and timelines
- memory layer foundations

### Phase C: Entry Shift

- four-mode project launchpad
- voice-visible command handoff
- command history demoted from destination to support layer

### Phase D: Trust And Polish

- autonomy policy surface
- auto-hiding chrome
- stronger visual system and motion language

## Net-New File And Component Focus

These are the main areas the improvements would change beyond the existing plan:

- `apps/web/src/app/workspace/WorkspaceHome.tsx`
  - convert from project directory to Larry Brief
- `apps/web/src/components/dashboard/ProjectWorkspace.tsx`
  - convert from tabs to continuous project canvas
- `apps/web/src/app/workspace/WorkspaceTopBar.tsx`
  - make chrome lighter and collapsible
- `apps/web/src/components/dashboard/Sidebar.tsx`
  - shift IA from tools to execution loop
- `apps/web/src/app/workspace/ProjectCreateSheet.tsx`
  - replace manual-first flow with four-mode launchpad
- `apps/web/src/app/workspace/actions/*`
  - evolve into reusable decision-rail components, not just page-level components
- `apps/web/src/app/workspace/chats/page.tsx`
  - reposition as history/deep thread view instead of primary Larry surface
- new memory-oriented components
  - unify meetings, documents, and source evidence

## Bottom Line

The existing expansion plan is the right foundation for making Larry work everywhere.

The improvements in this document are about making Larry feel like the product promised in the outline:

- autonomous
- fluid
- source-backed
- approval-steered
- and visibly different from a normal PM tool

That is the shift from "Larry is available in the workspace" to "the workspace behaves like Larry."
