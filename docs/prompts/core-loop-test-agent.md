# Larry Core Loop — Comprehensive Test Agent Prompt

Copy this entire prompt into a new Claude Code session to run the full test suite.

---

## Prompt

You are a QA agent testing Larry, an AI-powered project management tool. Your job is to test every feature in the core Intake → Intelligence → Execution loop against the deployed production app at https://larry-pm.com. You must be exhaustive, honest, and brutal. Flag every error, every slow response, every confusing UX, every silent failure.

## Setup

1. Read `docs/TESTING.md` for tools, route map, selectors, and verification checklist.
2. Read `.env.test` for production test credentials.
3. Sign in via Playwright MCP to https://larry-pm.com/login using those credentials.
4. After sign-in, take a screenshot to confirm you're on `/workspace`.

## What You're Testing

Larry's core value is a three-part loop:

**INTAKE** — Larry absorbs information from transcripts, chat, and project creation forms and structures it into tasks with owners, deadlines, and priorities.

**INTELLIGENCE** — Larry continuously analyzes projects, flags risks, identifies overloaded people, blocked tasks, and slipping deadlines.

**EXECUTION** — Larry acts: creates tasks, sends reminders, drafts emails, escalates blockers, nudges stakeholders.

Every test below maps to one or more parts of this loop. For each test, record:
- **PASS / FAIL / PARTIAL**
- **Response time** (fast <3s, acceptable <10s, slow <30s, timeout >30s)
- **What happened** (exact behaviour observed)
- **What should have happened** (if different)
- **Evidence** (screenshot, console error, network response code)

---

## TEST SUITE

### PHASE 1: INTAKE (Information → Structure)

#### Test 1.1: Create Project via Chat — Clear Input
1. Navigate to `/workspace/projects/new`
2. Choose Chat mode
3. Enter:
   - Project name: `"QA Test — Marketing Campaign"`
   - Outcome: `"Drive 500 qualified leads through multi-channel campaign by end of July"`
   - Deliverables: `"Landing page redesign, 6-part email nurture sequence, LinkedIn ad campaign, webinar series (3 sessions), case study PDF"`
   - Deadline/milestone: `"Landing page live by May 15, email sequences running by June 1"`
   - Risks: `"Design team at capacity until May 5. Webinar platform contract expires June 15."`
4. Complete the flow and wait for project creation.

**Verify:**
- [ ] Project created with a name and description
- [ ] 5-8 bootstrap tasks generated (not generic placeholders like "Define scope")
- [ ] Each task has: verb title, description, concrete due date (YYYY-MM-DD), priority
- [ ] Due dates are staggered across May-July (not all the same day)
- [ ] Risks from input are reflected in task priorities or descriptions
- [ ] After creation, Larry's analysis appears in Action Centre within 60 seconds

#### Test 1.2: Create Project via Chat — Vague Input
1. Navigate to `/workspace/projects/new`
2. Choose Chat mode
3. Enter:
   - Project name: `"Improve onboarding"`
   - Outcome: `"Make it better"`
   - Leave deliverables blank or say `"Not sure yet"`
   - Leave risks blank

**Verify:**
- [ ] Larry returns follow-up questions asking for specifics (NOT placeholder tasks)
- [ ] Questions are specific and helpful (e.g., "What aspects of onboarding?")
- [ ] No tasks like "Define project scope" or "Create delivery plan" are generated

#### Test 1.3: Transcript → New Project
1. Navigate to `/workspace/projects/new`
2. Choose Meeting/Transcript mode
3. Paste this transcript:

```
Sarah: The API migration needs to be done before the partner meeting on April 25th.
Marcus: I'll own the documentation. I need staging access — Joel, can you set that up?
Joel: I'll get staging creds to Marcus by end of day tomorrow.
Sarah: What about billing integration? We promised Stripe live by end of month.
Marcus: Webhook handlers are done. Invoice generation and customer portal are left — about a week.
Joel: I'll pick up billing. I'll have invoices done by April 20th, portal by April 28th.
Sarah: Marcus, can you have a draft of the docs by April 22nd for a partner preview?
Marcus: Draft by April 22nd, final by April 25th.
Sarah: Let's schedule a checkpoint for April 18th. Joel, send that invite.
Joel: Done.
```

**Verify:**
- [ ] Project created successfully
- [ ] 6-8 tasks extracted with specific titles (not generic)
- [ ] Tasks reference actual people (Marcus, Joel) in descriptions
- [ ] Due dates match what was said (April 18, 20, 22, 25, 28)
- [ ] Priorities reflect dependencies (staging access blocks docs)
- [ ] No tasks created from casual conversation

#### Test 1.4: Transcript → Existing Project
1. Navigate to `/workspace/meetings`
2. Select the project created in Test 1.1 from the dropdown
3. Paste this transcript:

```
Anna: Quick update — the landing page wireframes are done but we're behind on the email sequences. 
Fergus: I can take over email sequences. I'll have the first three done by May 20th.
Anna: Good. Also, the LinkedIn ad budget got approved — $5000/month. Who's managing that?
Fergus: I'll handle LinkedIn too. Campaign setup by May 25th.
Anna: One problem — the webinar platform migration has to happen before June 10th or we lose access.
Fergus: That's a blocker. We should escalate to the vendor this week.
```

**Verify:**
- [ ] Transcript is saved (appears in Meeting Notes list)
- [ ] Status changes from QUEUED to READY within 60 seconds
- [ ] Summary is meaningful (not "analysis pending" or error message)
- [ ] Suggested actions appear in Action Centre (task_create actions)
- [ ] Actions reference specific people, dates, and deliverables from transcript
- [ ] The existing project's tasks are NOT overwritten

#### Test 1.5: Transcript — Useless Input
1. On `/workspace/meetings`, select any project
2. Paste: `"Hey everyone, good call today. Let's keep the momentum going. Talk next week."`

**Verify:**
- [ ] Transcript is saved
- [ ] Either: no tasks generated (correct — no actionable items) OR follow-up questions returned
- [ ] No crash, no 500, no hanging

---

### PHASE 2: INTELLIGENCE (Analysis → Insight)

#### Test 2.1: Chat — Status Query
1. Open Larry chat in the project from Test 1.1
2. Send: `"What's the current status? Anything at risk?"`

**Verify:**
- [ ] Larry responds with a briefing mentioning actual project tasks
- [ ] References specific task names, deadlines, progress
- [ ] Identifies risks if any tasks are overdue or approaching deadline
- [ ] No actions generated (this is a query, not a command)
- [ ] Response time under 30 seconds

#### Test 2.2: Chat — Team Query
1. In the same project, send: `"Who's on this project and what are they working on?"`

**Verify:**
- [ ] Larry lists project members (NOT everyone in the organization)
- [ ] Shows active task count per person
- [ ] Response is factually correct (matches what you see in project view)

#### Test 2.3: Login Briefing
1. Log out and log back in
2. Check the workspace home page

**Verify:**
- [ ] Briefing loads for each project (not empty)
- [ ] Shows health status, action counts, any urgent items
- [ ] No errors in console
- [ ] Loads within 10 seconds

#### Test 2.4: 30-Minute Scan Visibility
1. Check Railway worker logs: `railway logs --service larry-worker -f`
2. Wait for or find a recent `[larry-scan]` log entry

**Verify:**
- [ ] Scan runs approximately every 30 minutes
- [ ] Log shows: `processed: N, failed: 0, actions: N`
- [ ] No error stack traces in the scan output

---

### PHASE 3: EXECUTION (Insight → Action)

#### Test 3.1: Chat — Create a Task
1. In the project from Test 1.1, send: `"Create a task to review the security audit findings. Assign to Marcus, due next Friday."`

**Verify:**
- [ ] Larry creates a task (either auto-executed or suggested in Action Centre)
- [ ] Task has the correct title, assignee reference, and due date
- [ ] Task appears in the project timeline/task list
- [ ] Briefing confirms the action was taken

#### Test 3.2: Chat — Vague Command (Should Ask)
1. Send: `"Fix everything that's broken"`

**Verify:**
- [ ] Larry asks clarifying questions (which tasks? what's broken? priority?)
- [ ] Does NOT generate random task_create actions
- [ ] Response is helpful and specific

#### Test 3.3: Accept a Suggested Action
1. Navigate to `/workspace/actions` (Action Centre)
2. Find any pending suggested action (from transcript processing or scan)
3. Click Accept

**Verify:**
- [ ] No 422 error
- [ ] No 500 error
- [ ] Action executes successfully (task created, status updated, etc.)
- [ ] Action moves from "pending" to "accepted" state
- [ ] The actual effect is visible (new task in timeline, status changed, etc.)

#### Test 3.4: Dismiss a Suggested Action
1. In Action Centre, find another pending action
2. Click Dismiss/Decline

**Verify:**
- [ ] Action is removed from pending list
- [ ] No errors
- [ ] Action marked as dismissed

#### Test 3.5: Email Draft Creation
1. In a project with team members who have email addresses, send: `"Draft an email to the team about the deadline change for the API migration. New deadline is April 25th."`

**Verify:**
- [ ] Larry creates an email_draft suggestion in Action Centre
- [ ] OR Larry mentions in briefing that email addresses are missing (if team has no emails)
- [ ] If draft created: it has a real recipient, subject, and body
- [ ] Navigate to `/workspace/email-drafts` — draft should appear there after accepting

#### Test 3.6: Email Draft Send
1. On `/workspace/email-drafts`, find an accepted draft
2. Click Send

**Verify:**
- [ ] Send request succeeds (no error)
- [ ] Draft status changes to "sent"
- [ ] No 500 or network error in console

#### Test 3.7: Escalation — Overdue Task
1. If any tasks exist that are past their due date, check:
   - Does the project show risk flags?
   - Has Larry generated any escalation notifications?

**Verify:**
- [ ] Navigate to `/workspace/notifications`
- [ ] Check for overdue/risk notifications
- [ ] If none exist, note this as a gap (escalation may need time to trigger)

---

### PHASE 4: CROSS-CUTTING CONCERNS

#### Test 4.1: Error Handling — Network Resilience
1. Open Larry chat and send a message
2. Check browser console for any errors
3. Check network tab for failed requests

**Verify:**
- [ ] No uncaught JavaScript errors in console
- [ ] No failed API requests (other than expected 401s if session expired)
- [ ] Error messages are user-friendly (not raw stack traces or "NotFoundError")

#### Test 4.2: Response Times
For each major action, record response time:

| Action | Target | Actual | Pass? |
|--------|--------|--------|-------|
| Page load (workspace home) | <3s | | |
| Project creation (with tasks) | <30s | | |
| Transcript processing to READY | <60s | | |
| Larry chat response | <15s | | |
| Accept action | <5s | | |
| Login | <3s | | |
| Briefing load | <10s | | |

#### Test 4.3: Navigation — All Sidebar Links
Click through every sidebar item and verify no 404s:

- [ ] Home (`/workspace`)
- [ ] My Tasks (`/workspace/my-work`)
- [ ] Actions (`/workspace/actions`)
- [ ] Meetings (`/workspace/meetings`)
- [ ] Calendar (`/workspace/calendar`)
- [ ] Documents (`/workspace/documents`)
- [ ] Mail (`/workspace/email-drafts`)
- [ ] Chats (`/workspace/chats`)
- [ ] Larry (`/workspace/larry`)
- [ ] Settings (`/workspace/settings`)
- [ ] Notifications (`/workspace/notifications`)

#### Test 4.4: Project View Completeness
1. Open the project from Test 1.1
2. Check each section:

- [ ] Timeline/Gantt renders with real task data
- [ ] Tasks are clickable and show details (assignee, deadline, status, priority)
- [ ] Task status can be changed (dropdown or click)
- [ ] Dashboard/analytics shows real metrics (not placeholders)
- [ ] Larry chat opens in project context

---

## REPORTING FORMAT

After all tests, produce a structured report:

```markdown
# Larry Core Loop Test Report — [Date]

## Summary
- Tests run: X
- Passed: X
- Failed: X  
- Partial: X
- Blocked: X

## Critical Failures (must fix before demo)
1. [Test ID] — [What broke] — [Evidence]

## Important Issues (fix this week)
1. [Test ID] — [What's wrong] — [Impact]

## Minor Issues (backlog)
1. [Test ID] — [What could be better]

## Performance Observations
[Response time table]

## Detailed Results
[Full test-by-test results with screenshots]

## Recommendations for Next Agent
Prioritized list of fixes and improvements for the implementation agent,
organized by the core loop phase they affect (Intake / Intelligence / Execution).
Each recommendation should include:
- What to fix (specific file and function if known)
- Why it matters (user impact)
- Suggested approach
```

## IMPORTANT RULES

1. **Test on production only** — https://larry-pm.com. Do not test locally.
2. **Screenshot everything** — every pass, every fail. Evidence is required.
3. **Check console + network** on every test — silent failures are the worst kind.
4. **Check Railway worker logs** for transcript and scan tests — the worker does the heavy lifting.
5. **Be honest** — if something half-works, it's PARTIAL, not PASS. If something looks OK but the console shows errors, it's a FAIL.
6. **Clean up after yourself** — if you create test projects, note their names so they can be deleted later.
7. **Do not fix anything** — your job is to find and report problems. The next agent will fix them.
