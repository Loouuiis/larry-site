/**
 * Demo seed script — creates a realistic "Q2 Product Launch" workspace
 * to demonstrate all Larry features: Slack signals, transcript ingestion,
 * calendar events, Action Center approvals, and Larry Chat.
 *
 * Run: npm run db:seed
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE throughout.
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../apps/api/.env"),
  path.resolve(process.cwd(), "../../apps/worker/.env"),
];
for (const c of envCandidates) {
  if (existsSync(c)) loadEnv({ path: c, override: false });
}

import { Db } from "./client.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const db = new Db(DATABASE_URL);

// ─── Stable IDs ───────────────────────────────────────────────────────────────
const TENANT_ID   = "11111111-1111-4111-8111-111111111111";
const U_ADMIN     = "22222222-2222-4222-8222-222222222222"; // dev@larry.local
const U_SARAH     = "33333333-3333-4333-8333-333333333333"; // sarah@larry.local
const U_MARCUS    = "44444444-4444-4444-8444-444444444444"; // marcus@larry.local

const PROJECT_ID  = "55555555-5555-4555-8555-555555555555";
const PROJECT2_ID = "66666666-6666-4666-8666-666666666666";

const P2T1 = "a1000001-0000-4000-8000-000000000001"; // Map current onboarding UX
const P2T2 = "a1000002-0000-4000-8000-000000000002"; // Design new flow in Figma
const P2T3 = "a1000003-0000-4000-8000-000000000003"; // Write onboarding email sequence
const P2T4 = "a1000004-0000-4000-8000-000000000004"; // Implement in-app tooltips
const P2T5 = "a1000005-0000-4000-8000-000000000005"; // A/B test setup
const P2T6 = "a1000006-0000-4000-8000-000000000006"; // Analytics instrumentation

const T1 = "a0000001-0000-4000-8000-000000000001"; // Finalize pricing page copy
const T2 = "a0000002-0000-4000-8000-000000000002"; // QA sign-off on checkout flow
const T3 = "a0000003-0000-4000-8000-000000000003"; // Prepare investor demo deck
const T4 = "a0000004-0000-4000-8000-000000000004"; // Set up analytics tracking
const T5 = "a0000005-0000-4000-8000-000000000005"; // Legal review of ToS updates
const T6 = "a0000006-0000-4000-8000-000000000006"; // Launch email campaign
const T7 = "a0000007-0000-4000-8000-000000000007"; // Performance testing on API
const T8 = "a0000008-0000-4000-8000-000000000008"; // Update onboarding flow

const CE1 = "b0000001-0000-4000-8000-000000000001"; // Slack signal
const CE2 = "b0000002-0000-4000-8000-000000000002"; // Transcript ingestion
const CE3 = "b0000003-0000-4000-8000-000000000003"; // Calendar event

const COMPAT_AGENT_RUN_ID_PENDING = "c0000002-0000-4000-8000-000000000002";
const COMPAT_AGENT_RUN_ID_EXECUTED = "c0000003-0000-4000-8000-000000000003";
const COMPAT_ACTION_ID_EMAIL_DRAFT = "d0000004-0000-4000-8000-000000000004";

const MN1 = "e0000001-0000-4000-8000-000000000001"; // Sprint standup note
const MN2 = "e0000002-0000-4000-8000-000000000002"; // Stakeholder sync note

const LC1 = "f0000001-0000-4000-8000-000000000001"; // Larry conversation
const PMEM1 = "f1000001-0000-4000-8000-000000000001"; // Project memory: chat
const PMEM2 = "f1000002-0000-4000-8000-000000000002"; // Project memory: accepted action
const PMEM3 = "f1000003-0000-4000-8000-000000000003"; // Project memory: meeting
const PN1 = "f3000001-0000-4000-8000-000000000001"; // Shared project note
const PN2 = "f3000002-0000-4000-8000-000000000002"; // Personal project note
const INTAKE_DRAFT_ID = "f2000001-0000-4000-8000-000000000001"; // Intake draft fixture
const DOC_EMAIL_DRAFT_ID = "f4000001-0000-4000-8000-000000000001"; // Document asset: email draft
const DOC_TEMPLATE_DOCX_ID = "f4000002-0000-4000-8000-000000000002"; // Document asset: docx template
const DOC_TEMPLATE_XLSX_ID = "f4000003-0000-4000-8000-000000000003"; // Document asset: xlsx template
const TASK_DOC_ATTACHMENT_ID = "f4000004-0000-4000-8000-000000000004"; // Task-document attachment fixture

// ─── bcrypt hash for "DevPass123!" at 12 rounds ───────────────────────────────
// Pre-computed so the seed doesn't require bcryptjs as a dep.
// To regenerate: node -e "require('bcryptjs').hash('DevPass123!',12).then(console.log)"
const DEV_PASS_HASH = "$2b$12$SjkLUt9sfCzzTGw4k6YI3OLi9WO4FmUmJq.dcFssppzOOh1hj39by";

async function q(sql: string, values: unknown[] = []) {
  return db.query(sql, values);
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10); // date only
}

function contentHash(content: string): string {
  return createHash("sha256")
    .update(content.replace(/\s+/g, " ").trim())
    .digest("hex");
}

async function seed() {
  console.log("🌱  Seeding demo data for Larry PM…\n");

  // ── 1. Tenant ────────────────────────────────────────────────────────────────
  await q(`
    INSERT INTO tenants (id, name, slug, region)
    VALUES ($1, 'Acme Corp', 'acme', 'eu-west-1')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `, [TENANT_ID]);
  console.log("✓  Tenant: Acme Corp");

  // ── 2. Users ─────────────────────────────────────────────────────────────────
  await q(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES
      ($1, 'dev@larry.local',    $4, 'Alex (You)'),
      ($2, 'sarah@larry.local',  $4, 'Sarah Chen'),
      ($3, 'marcus@larry.local', $4, 'Marcus Reid')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
  `, [U_ADMIN, U_SARAH, U_MARCUS, DEV_PASS_HASH]);
  console.log("✓  Users: Alex (admin), Sarah Chen (pm), Marcus Reid (member)");

  // ── 3. Memberships ───────────────────────────────────────────────────────────
  await q(`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES
      ($1, $2, 'admin'),
      ($1, $3, 'pm'),
      ($1, $4, 'member')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
  `, [TENANT_ID, U_ADMIN, U_SARAH, U_MARCUS]);
  console.log("✓  Memberships set");

  // ── 4. Tenant policy settings ────────────────────────────────────────────────
  await q(`
    INSERT INTO tenant_policy_settings (tenant_id, low_impact_min_confidence, medium_impact_min_confidence, auto_execute_low_impact)
    VALUES ($1, 0.75, 0.90, true)
    ON CONFLICT (tenant_id) DO NOTHING
  `, [TENANT_ID]);

  // ── 5. Project ───────────────────────────────────────────────────────────────
  await q(`
    INSERT INTO projects (id, tenant_id, name, description, owner_user_id, status, risk_score, risk_level, start_date, target_date)
    VALUES ($1, $2, 'Q2 Product Launch',
      'Full launch of the v2 product: updated pricing, checkout v2, investor demo, and email campaign.',
      $3, 'active', 58.50, 'medium', $4, $5)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, risk_score = EXCLUDED.risk_score
  `, [PROJECT_ID, TENANT_ID, U_ADMIN, daysAgo(21).slice(0, 10), daysFromNow(18)]);
  console.log("✓  Project: Q2 Product Launch");

  // ── 6. Tasks ─────────────────────────────────────────────────────────────────
  const tasks = [
    [T1, 'Finalize pricing page copy',       'Rewrite and get sign-off on all pricing tier descriptions. Needs legal + marketing approval.',  'in_progress', 'high',     U_SARAH,  45, 32.0, 'medium', daysAgo(10).slice(0,10), daysFromNow(3)],
    [T2, 'QA sign-off on checkout flow',     'Full regression pass on the new checkout. Blocking launch.',                                     'blocked',     'critical', U_MARCUS, 20, 78.5, 'high',   daysAgo(7).slice(0,10),  daysFromNow(1)],
    [T3, 'Prepare investor demo deck',       'Build the deck for the Q2 board update. Include metrics, roadmap slide, and demo walkthrough.', 'in_progress', 'high',     U_ADMIN,  60, 44.0, 'medium', daysAgo(5).slice(0,10),  daysFromNow(5)],
    [T4, 'Set up analytics tracking',        'Instrument new checkout funnel with Amplitude. Define conversion events.',                       'not_started', 'medium',   U_MARCUS,  0, 12.0, 'low',    daysFromNow(1),          daysFromNow(9)],
    [T5, 'Legal review of ToS updates',      'Send updated terms to legal counsel and track sign-off.',                                        'waiting',     'medium',   U_SARAH,  10,  8.0, 'low',    daysAgo(3).slice(0,10),  daysFromNow(7)],
    [T6, 'Launch email campaign',            'Write, review, and schedule the launch announcement email to all subscribers.',                  'not_started', 'high',     U_ADMIN,   0, 22.0, 'low',    daysFromNow(5),          daysFromNow(14)],
    [T7, 'Performance testing on API',       'Load test checkout and search endpoints. Target: p99 < 300ms at 10k rps.',                      'in_progress', 'high',     U_MARCUS, 55, 35.0, 'medium', daysAgo(4).slice(0,10),  daysFromNow(4)],
    [T8, 'Update onboarding flow',           'Revise onboarding copy and UX to match new pricing tiers. Deployed to staging.',                'completed',   'medium',   U_SARAH,  100, 0.0, 'low',    daysAgo(14).slice(0,10), daysAgo(2).slice(0,10)],
  ];

  for (const [id, title, desc, status, priority, assignee, progress, risk_score, risk_level, start_date, due_date] of tasks) {
    await q(`
      INSERT INTO tasks (id, tenant_id, project_id, title, description, status, priority, assignee_user_id,
        created_by_user_id, progress_percent, risk_score, risk_level, start_date, due_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, progress_percent = EXCLUDED.progress_percent, risk_score = EXCLUDED.risk_score
    `, [id, TENANT_ID, PROJECT_ID, title, desc, status, priority, assignee, U_ADMIN, progress, risk_score, risk_level, start_date, due_date]);
  }
  console.log("✓  Tasks: 8 tasks created");

  // ── 7. Task dependencies ─────────────────────────────────────────────────────
  await q(`
    INSERT INTO task_dependencies (tenant_id, task_id, depends_on_task_id, relation)
    VALUES
      ($1, $3, $2, 'finish_to_start'),
      ($1, $4, $2, 'finish_to_start')
    ON CONFLICT (tenant_id, task_id, depends_on_task_id) DO NOTHING
  `, [TENANT_ID, T2, T6, T4]);
  // T6 (launch campaign) depends on T2 (QA) — blocked dependency chain
  // T4 (analytics) depends on T2 (QA) as well
  console.log("✓  Task dependencies set");

  // ── 8. Task comments ─────────────────────────────────────────────────────────
  const comments = [
    [TENANT_ID, PROJECT_ID, T2, U_MARCUS, 'Checkout flow failing on mobile Safari — card element not rendering. Investigating.',          daysAgo(2)],
    [TENANT_ID, PROJECT_ID, T2, U_SARAH,  'Same issue on Firefox too. This is a Stripe.js version mismatch. Will need a hotfix deploy.', daysAgo(1)],
    [TENANT_ID, PROJECT_ID, T1, U_ADMIN,  'Copy draft is in Notion. Waiting for marketing lead to sign off on tier names.',              daysAgo(3)],
    [TENANT_ID, PROJECT_ID, T3, U_SARAH,  'Deck slide 4 needs the updated ARR chart. Can you pull from the dashboard?',                 daysAgo(1)],
    [TENANT_ID, PROJECT_ID, T7, U_MARCUS, 'Load test run 3 complete — p99 at 280ms under 8k rps. One more run at 12k needed.',          daysAgo(0)],
  ];
  for (const [tid, pid, taskId, author, body, ts] of comments) {
    await q(
      `INSERT INTO task_comments (tenant_id, project_id, task_id, author_user_id, body, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [tid, pid, taskId, author, body, ts]
    );
  }
  console.log("✓  Task comments added");

  // ── 9. Canonical events ──────────────────────────────────────────────────────

  // CE1: Slack signal about QA failure
  await q(`
    INSERT INTO canonical_events (id, tenant_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
    VALUES ($1, $2, 'slack', 'slack-msg-001', 'message.received', 'marcus@larry.local', 0.92, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [CE1, TENANT_ID, daysAgo(1), JSON.stringify({
    channel: '#product-launch',
    text: "The checkout flow is still broken — QA failed again for the 3rd time. Marcus needs at least 2 more days to isolate the Stripe.js regression. This is now blocking the launch date.",
    userId: 'U_MARCUS_SLACK',
    teamId: 'T0ALG48QSE9',
  })]);

  // CE2: Transcript from standup
  await q(`
    INSERT INTO canonical_events (id, tenant_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
    VALUES ($1, $2, 'transcript', 'transcript-standup-001', 'transcript.submitted', 'dev@larry.local', 0.95, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [CE2, TENANT_ID, daysAgo(0), JSON.stringify({
    transcript: STANDUP_TRANSCRIPT,
    projectId: PROJECT_ID,
  })]);

  // CE3: Calendar event
  await q(`
    INSERT INTO canonical_events (id, tenant_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
    VALUES ($1, $2, 'calendar', 'cal-event-q2-review', 'event.created', 'dev@larry.local', 0.88, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [CE3, TENANT_ID, daysAgo(0), JSON.stringify({
    eventTitle: 'Q2 Launch Review — All Hands',
    startTime: daysFromNow(1) + 'T14:00:00Z',
    endTime: daysFromNow(1) + 'T15:00:00Z',
    attendees: ['dev@larry.local', 'sarah@larry.local', 'marcus@larry.local'],
    calendarId: 'primary',
  })]);
  console.log("✓  Canonical events: Slack + Transcript + Calendar");

  console.log("✓  Migration E compatibility: skipped agent_runs/extracted_actions seeding");


  // 10. Email outbound draft (compatibility action_id placeholder)
  await q(`
    INSERT INTO email_outbound_drafts (tenant_id, project_id, action_id, created_by_user_id, recipient, subject, body, state, sent_at)
    VALUES ($1, $2, $3, $4,
      'stakeholders@acme.com',
      'Q2 Launch — Checkout Delay Update',
      'Hi team,

Wanted to flag that the checkout QA regression is currently blocking our Q2 launch timeline. Marcus is leading the fix and expects resolution within 48 hours.

We will send a further update once QA sign-off is confirmed.

— Larry (on behalf of Alex)',
      'sent', $5)
    ON CONFLICT DO NOTHING
  `, [TENANT_ID, PROJECT_ID, COMPAT_ACTION_ID_EMAIL_DRAFT, U_ADMIN, daysAgo(1)]);
  console.log("✓  Email outbound draft: stakeholder update (canonical runtime + compatibility action_id)");

  await q(`
    INSERT INTO documents
      (id, tenant_id, project_id, title, content, doc_type, source_kind, source_record_id, version, metadata, created_by_user_id, created_at, updated_at)
    VALUES
      (
        $1, $2, $3,
        'Stakeholder delay update draft',
        'Subject: Q2 Launch - Checkout Delay Update\n\nHi team,\n\nWanted to flag that checkout QA remains blocked pending Stripe.js regression fixes. We are currently projecting up to a 7-day shift in launch readiness.\n\nI will send another update once QA sign-off is confirmed.\n\nThanks,\nAlex',
        'email_draft',
        'email_draft',
        $4,
        1,
        $5::jsonb,
        $6,
        $7,
        $7
      ),
      (
        $8, $2, $3,
        'Q2 Launch Brief Template',
        '# Q2 Launch Brief\n\n## Objective\n- Define launch objective\n\n## Scope\n- In scope\n- Out of scope\n\n## Risks\n- Top three risks\n',
        'docx_template',
        'template',
        'seed-template-docx',
        1,
        '{"templateCategory":"project_brief","format":"docx"}'::jsonb,
        $6,
        $7,
        $7
      ),
      (
        $9, $2, $3,
        'Q2 Launch Milestones Template',
        'Sheet: Milestones\nColumns: Milestone, Owner, Target Date, Status\n',
        'xlsx_template',
        'template',
        'seed-template-xlsx',
        1,
        '{"templateCategory":"milestone_tracker","format":"xlsx"}'::jsonb,
        $6,
        $7,
        $7
      )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      doc_type = EXCLUDED.doc_type,
      source_kind = EXCLUDED.source_kind,
      source_record_id = EXCLUDED.source_record_id,
      version = EXCLUDED.version,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at
  `, [
    DOC_EMAIL_DRAFT_ID,
    TENANT_ID,
    PROJECT_ID,
    COMPAT_ACTION_ID_EMAIL_DRAFT,
    JSON.stringify({ recipient: "stakeholders@acme.com", state: "sent", provider: "seed" }),
    U_ADMIN,
    daysAgo(1),
    DOC_TEMPLATE_DOCX_ID,
    DOC_TEMPLATE_XLSX_ID,
  ]);

  await q(`
    INSERT INTO task_document_attachments
      (id, tenant_id, task_id, document_id, attached_by_user_id, created_at)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tenant_id, task_id, document_id) DO UPDATE SET
      attached_by_user_id = EXCLUDED.attached_by_user_id
  `, [TASK_DOC_ATTACHMENT_ID, TENANT_ID, T1, DOC_TEMPLATE_DOCX_ID, U_ADMIN, daysAgo(0)]);
  console.log("✓  Document assets + task attachment fixtures seeded");

  // ── 11. Meeting notes ────────────────────────────────────────────────────────
  await q(`
    INSERT INTO meeting_notes (id, tenant_id, project_id, agent_run_id, title, transcript, summary, action_count, meeting_date, created_by_user_id, created_at)
    VALUES
      ($1, $2, $3, NULL,
       'Daily Standup — Q2 Launch',
       $4, $5, 3, $6, $7, $8),
      ($9, $2, $3, $10,
       'Q2 Launch Review — All Hands',
       $11, $12, 2, $13, $7, $14)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
  `, [
    MN1, TENANT_ID, PROJECT_ID,
    STANDUP_TRANSCRIPT,
    'Standup surfaced 3 blockers: QA failure on checkout (Marcus), pricing copy pending sign-off (Sarah), and investor deck slide 4 needs updated ARR. Larry extracted 3 proposed actions.',
    daysAgo(1).slice(0, 10), U_ADMIN, daysAgo(1),

    MN2, COMPAT_AGENT_RUN_ID_EXECUTED,
    CALENDAR_TRANSCRIPT,
    'All-hands review confirmed the launch is at risk. Team agreed to a 7-day extension pending QA resolution. Larry proposed a deadline change — awaiting approval in Action Center.',
    daysAgo(0).slice(0, 10), daysAgo(0),
  ]);
  console.log("✓  Meeting notes: standup + all-hands review");

  // ── 12. Activity log ─────────────────────────────────────────────────────────
  await q(`
    INSERT INTO activity_log (tenant_id, project_id, task_id, actor_user_id, activity_type, payload, created_at)
    VALUES
      ($1, $2, $3, $4, 'task.status_changed',
       '{"from":"in_progress","to":"blocked","reason":"QA regression — Stripe.js version mismatch"}'::jsonb, $5),
      ($1, $2, $6, $7, 'task.comment_added',
       '{"body":"Load test run 3 complete — p99 at 280ms under 8k rps."}'::jsonb, $8),
      ($1, $2, $9, $10,'task.status_changed',
       '{"from":"not_started","to":"in_progress"}'::jsonb, $11)
    ON CONFLICT DO NOTHING
  `, [
    TENANT_ID, PROJECT_ID, T2, U_MARCUS, daysAgo(2),
    T7, U_MARCUS,               daysAgo(0),
    T1, U_SARAH,                daysAgo(3),
  ]);

  // ── 13. Notifications ────────────────────────────────────────────────────────
  await q(`
    INSERT INTO notifications (tenant_id, user_id, channel, subject, body, metadata, created_at)
    VALUES
      ($1, $2, 'in_app', 'QA task overdue',
       'Task "QA sign-off on checkout flow" is 1 day past its due date and blocking 2 dependent tasks.',
       '{"taskId":"${T2}","projectId":"${PROJECT_ID}","type":"deadline_breach"}'::jsonb, $3),
      ($1, $4, 'in_app', 'Investor demo deck due in 48h',
       'Task "Prepare investor demo deck" is due in 48 hours and is currently at 60% progress.',
       '{"taskId":"${T3}","projectId":"${PROJECT_ID}","type":"pre_deadline_alert"}'::jsonb, $5),
      ($1, $6, 'in_app', '2 actions awaiting your review',
       'Larry extracted 2 proposed actions from the standup transcript. Review them in the Action Center.',
       '{"agentRunId":"${COMPAT_AGENT_RUN_ID_PENDING}","actionCount":2,"type":"approval_pending"}'::jsonb, $7)
    ON CONFLICT DO NOTHING
  `, [
    TENANT_ID, U_MARCUS, daysAgo(0),
    U_ADMIN,             daysAgo(0),
    U_ADMIN,             daysAgo(0),
  ]);
  console.log("✓  Notifications: 3 unread");

  // ── 14. Larry conversation (Chats page demo) ──────────────────────────────────
  await q(`
    INSERT INTO larry_conversations (id, tenant_id, project_id, user_id, title, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'Q2 Launch status check', $5, $5)
    ON CONFLICT (id) DO NOTHING
  `, [LC1, TENANT_ID, PROJECT_ID, U_ADMIN, daysAgo(1)]);

  await q(`
    INSERT INTO larry_messages (tenant_id, conversation_id, role, content, created_at)
    VALUES
      ($1, $2, 'user',  'What''s the current status of the Q2 launch?', $3),
      ($1, $2, 'larry', 'The Q2 Product Launch is at medium risk (score 58/100). The critical blocker is the QA regression on the checkout flow — it''s failed 3 times and is blocking both the email campaign launch and analytics setup. Marcus is on it but needs 2 more days. Sarah''s pricing copy is 45% done with sign-off pending. I''ve proposed a 7-day deadline extension and a task reassignment for your review in the Action Center.', $4),
      ($1, $2, 'user',  'Draft a slack message to the team about the delay.', $5),
      ($1, $2, 'larry', 'Done — I''ve queued a draft follow-up email to stakeholders and logged it in the Action Center for your review before it goes out. Would you like me to adjust the tone or add more detail?', $5)
    ON CONFLICT DO NOTHING
  `, [TENANT_ID, LC1, daysAgo(1), daysAgo(1), daysAgo(0)]);
  console.log("✓  Larry conversation seeded for Chats demo");

  const memoryChatContent =
    "User asked for launch risk summary. Larry highlighted checkout QA as the critical blocker and proposed mitigation actions.";
  const memoryActionContent =
    "Accepted action: extend checkout QA deadline by 7 days while Stripe.js regression fixes are verified.";
  const memoryMeetingContent =
    "Standup summary captured QA regression, pricing sign-off delay, and investor deck dependencies with owners.";

  await q(`
    INSERT INTO project_memory_entries
      (id, tenant_id, project_id, source, source_kind, source_record_id, content, content_hash, created_at)
    VALUES
      ($1, $2, $3, 'Larry chat', 'chat', $4, $5, $6, $7),
      ($8, $2, $3, 'Action Centre', 'action', $9, $10, $11, $12),
      ($13, $2, $3, 'Meeting transcript', 'meeting', $14, $15, $16, $17)
    ON CONFLICT (id) DO UPDATE
      SET source = EXCLUDED.source,
          source_kind = EXCLUDED.source_kind,
          source_record_id = EXCLUDED.source_record_id,
          content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          created_at = EXCLUDED.created_at
  `, [
    PMEM1, TENANT_ID, PROJECT_ID, LC1, memoryChatContent, contentHash(memoryChatContent), daysAgo(1),
    PMEM2, "ev-demo-accepted-1", memoryActionContent, contentHash(memoryActionContent), daysAgo(0),
    PMEM3, MN1, memoryMeetingContent, contentHash(memoryMeetingContent), daysAgo(0),
  ]);

  await q(`
    INSERT INTO project_notes
      (id, tenant_id, project_id, author_user_id, visibility, recipient_user_id, content, source_kind, source_record_id, created_at, updated_at)
    VALUES
      ($1, $2, $3, $4, 'shared', NULL,
       'Shared note: Keep checkout QA and investor deck updates synced in daily standup.',
       'manual', NULL, $5, $5),
      ($6, $2, $3, $4, 'personal', $7,
       'Personal note for Marcus: please post an EOD checkpoint in #product-launch after QA rerun.',
       'manual', NULL, $8, $8)
    ON CONFLICT (id) DO UPDATE SET
      visibility = EXCLUDED.visibility,
      recipient_user_id = EXCLUDED.recipient_user_id,
      content = EXCLUDED.content,
      source_kind = EXCLUDED.source_kind,
      source_record_id = EXCLUDED.source_record_id,
      updated_at = EXCLUDED.updated_at
  `, [
    PN1,
    TENANT_ID,
    PROJECT_ID,
    U_ADMIN,
    daysAgo(1),
    PN2,
    U_MARCUS,
    daysAgo(0),
  ]);

  await q(`
    INSERT INTO project_intake_drafts
      (id, tenant_id, mode, status,
       project_name, project_description, project_start_date, project_target_date, attach_to_project_id,
       chat_answers, meeting_title, meeting_transcript,
       bootstrap_summary, bootstrap_tasks, bootstrap_actions, bootstrap_seed_message,
       created_by_user_id, created_at, updated_at)
    VALUES
      ($1, $2, 'chat', 'bootstrapped',
       'Market Expansion Sprint',
       'Prepare launch operations for the market expansion sprint with sales, legal, and content readiness.',
       $3::date, $4::date, NULL,
       $5::jsonb,
       NULL,
       NULL,
       'Larry prepared starter tasks from intake context.',
       $6::jsonb,
       $7::jsonb,
       'I created this project from guided intake answers.',
       $8, $9, $9)
    ON CONFLICT (id) DO UPDATE SET
      mode = EXCLUDED.mode,
      status = EXCLUDED.status,
      project_name = EXCLUDED.project_name,
      project_description = EXCLUDED.project_description,
      project_start_date = EXCLUDED.project_start_date,
      project_target_date = EXCLUDED.project_target_date,
      chat_answers = EXCLUDED.chat_answers,
      bootstrap_summary = EXCLUDED.bootstrap_summary,
      bootstrap_tasks = EXCLUDED.bootstrap_tasks,
      bootstrap_actions = EXCLUDED.bootstrap_actions,
      bootstrap_seed_message = EXCLUDED.bootstrap_seed_message,
      updated_at = EXCLUDED.updated_at
  `, [
    INTAKE_DRAFT_ID,
    TENANT_ID,
    daysAgo(2).slice(0, 10),
    daysFromNow(20),
    JSON.stringify([
      "Market Expansion Sprint",
      "Launch in one new market with legal and sales readiness.",
      "Go-live target in five weeks.",
      "Finalize launch checklist; Prepare legal review pack; Coordinate sales enablement deck",
      "Risk: legal sign-off may slip by one week.",
    ]),
    JSON.stringify([
      {
        title: "Finalize launch checklist",
        description: null,
        dueDate: daysFromNow(14),
        assigneeName: null,
        priority: "medium",
      },
      {
        title: "Prepare legal review pack",
        description: null,
        dueDate: daysFromNow(10),
        assigneeName: null,
        priority: "medium",
      },
    ]),
    JSON.stringify([
      {
        type: "scope_change",
        displayText: "Refine project scope from intake context",
        reasoning: "Intake responses include scope and risk details worth preserving as editable scope text",
        payload: {
          entityId: "__PROJECT_ID__",
          entityType: "project",
          newDescription: "Launch in one new market with legal and sales readiness. Risk: legal sign-off may slip by one week.",
        },
      },
    ]),
    U_ADMIN,
    daysAgo(1),
  ]);
  console.log("✓  Project memory and notes entries seeded");

  // ── 15. Risk snapshots ───────────────────────────────────────────────────────
  await q(`
    INSERT INTO risk_snapshots (tenant_id, project_id, task_id, risk_score, risk_level, signals, created_at)
    VALUES
      ($1, $2, $3, 78.5, 'high',   '{"deadline_breach":true,"dependent_tasks_blocked":2}'::jsonb, $4),
      ($1, $2, $5, 44.0, 'medium', '{"progress_low":true,"days_remaining":5}'::jsonb, $6),
      ($1, $2, $7, 35.0, 'medium', '{"inactivity_days":3}'::jsonb, $8)
    ON CONFLICT DO NOTHING
  `, [
    TENANT_ID, PROJECT_ID, T2, daysAgo(0),
    T3,                        daysAgo(0),
    T7,                        daysAgo(0),
  ]);
  console.log("✓  Risk snapshots recorded");

  // ── 16. Second demo project: Customer Onboarding Redesign ──────────────────────
  await q(`
    INSERT INTO projects (id, tenant_id, name, description, owner_user_id, status, risk_score, risk_level, start_date, target_date)
    VALUES ($1, $2, 'Customer Onboarding Redesign',
      'Redesign the end-to-end onboarding flow to reduce time-to-value from 14 days to 3. Covers UX, email sequences, in-app tooltips, and A/B testing.',
      $3, 'active', 14.0, 'low', $4, $5)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, risk_score = EXCLUDED.risk_score
  `, [PROJECT2_ID, TENANT_ID, U_SARAH, daysAgo(14).slice(0, 10), daysFromNow(30)]);
  console.log("✓  Project 2: Customer Onboarding Redesign");

  await q(`
    INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
    VALUES
      ($1, $2, $3, 'owner'),
      ($1, $2, $4, 'editor'),
      ($1, $2, $5, 'viewer'),
      ($1, $6, $4, 'owner'),
      ($1, $6, $3, 'editor'),
      ($1, $6, $5, 'viewer')
    ON CONFLICT (tenant_id, project_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
  `, [TENANT_ID, PROJECT_ID, U_ADMIN, U_SARAH, U_MARCUS, PROJECT2_ID]);
  console.log("✓  Project memberships seeded");

  const p2tasks = [
    [P2T1, 'Map current onboarding UX',         'Document every step of the current onboarding flow, including drop-off points and time-on-step data from Amplitude.',         'completed',   'medium',   U_SARAH,  100,  0.0, 'low',    daysAgo(12).slice(0,10), daysAgo(7).slice(0,10)],
    [P2T2, 'Design new flow in Figma',           'Create high-fidelity mockups for the revised onboarding. Focus on reducing steps from 11 to 5 and removing the mandatory credit card screen.', 'in_progress', 'high',     U_SARAH,   70,  8.0, 'low',    daysAgo(7).slice(0,10),  daysFromNow(5)],
    [P2T3, 'Write onboarding email sequence',    'Draft a 5-email drip sequence (days 0, 1, 3, 7, 14). Tone: warm, helpful, milestone-driven. Sarah to review.',              'in_progress', 'medium',   U_ADMIN,   40, 10.0, 'low',    daysAgo(5).slice(0,10),  daysFromNow(8)],
    [P2T4, 'Implement in-app tooltips',          'Build contextual tooltips for 6 key screens using Intercom. Triggered by user inactivity or first visit.',                  'not_started', 'medium',   U_MARCUS,   0,  5.0, 'low',    daysFromNow(6),          daysFromNow(16)],
    [P2T5, 'A/B test setup',                    'Configure Optimizely split for old vs new onboarding. Target: 500 new signups per variant. Measure activation rate at day 3.','not_started', 'high',     U_ADMIN,    0,  3.0, 'low',    daysFromNow(10),         daysFromNow(24)],
    [P2T6, 'Analytics instrumentation',         'Instrument new onboarding funnel in Amplitude. Define activation event: "first project created". Track each step as a funnel event.', 'not_started', 'medium', U_MARCUS,   0,  2.0, 'low',  daysFromNow(8),          daysFromNow(20)],
  ];

  for (const [id, title, desc, status, priority, assignee, progress, risk_score, risk_level, start_date, due_date] of p2tasks) {
    await q(`
      INSERT INTO tasks (id, tenant_id, project_id, title, description, status, priority, assignee_user_id,
        created_by_user_id, progress_percent, risk_score, risk_level, start_date, due_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, progress_percent = EXCLUDED.progress_percent
    `, [id, TENANT_ID, PROJECT2_ID, title, desc, status, priority, assignee, U_SARAH, progress, risk_score, risk_level, start_date, due_date]);
  }
  console.log("✓  Project 2 tasks: 6 tasks (1 completed, 2 in progress, 3 not started)");

  // Task dependency: tooltips depend on Figma design being done
  await q(`
    INSERT INTO task_dependencies (tenant_id, task_id, depends_on_task_id, relation)
    VALUES ($1, $2, $3, 'finish_to_start')
    ON CONFLICT (tenant_id, task_id, depends_on_task_id) DO NOTHING
  `, [TENANT_ID, P2T4, P2T2]);

  // A few comments to make it feel alive
  const p2comments = [
    [TENANT_ID, PROJECT2_ID, P2T2, U_SARAH,  'Figma draft is at 70% — the simplified 5-step flow is looking really clean. Sharing with the team for async review tomorrow.',           daysAgo(1)],
    [TENANT_ID, PROJECT2_ID, P2T2, U_ADMIN,  'Love the direction. One ask: can we remove the "invite teammates" step from the required path? We keep losing people there.',             daysAgo(0)],
    [TENANT_ID, PROJECT2_ID, P2T3, U_ADMIN,  'Day 0 and day 1 emails are drafted. Day 3 is the trickiest — needs to nudge without being annoying. Will share a draft this week.',     daysAgo(2)],
  ];
  for (const [tid, pid, taskId, author, body, ts] of p2comments) {
    await q(
      `INSERT INTO task_comments (tenant_id, project_id, task_id, author_user_id, body, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [tid, pid, taskId, author, body, ts]
    );
  }
  console.log("✓  Project 2 comments added");

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Demo seed complete! Log in with:

    Email:    dev@larry.local
    Password: DevPass123!

  Projects:
    • Q2 Product Launch          — medium risk, checkout blocked, 3 actions pending
    • Customer Onboarding Redesign — low risk, on track, 30-day runway

  What to demo:
    1. Action Center  → 2 pending ledger actions from Slack + transcript
    2. Project board  → Q2 Product Launch with 8 tasks, blocked checkout
    3. Project board  → Onboarding Redesign with 6 tasks, healthy progress
    4. Meetings       → Standup note with AI summary + linked ledger actions
    5. Larry Chat     → Ask for a summary or draft a follow-up
    6. Settings       → Connect Slack / Calendar / Email via OAuth
    7. Notifications  → 3 unread alerts (bell icon)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

// ─── Demo transcript fixtures ─────────────────────────────────────────────────

const STANDUP_TRANSCRIPT = `
Daily Standup — Q2 Product Launch
Date: ${new Date().toLocaleDateString("en-GB")}
Attendees: Alex, Sarah Chen, Marcus Reid

--- Marcus Reid ---
Still stuck on the checkout QA regression. It's a Stripe.js version mismatch with our bundler. I need at least 2 more days to isolate it properly. This is blocking everything downstream — the email campaign and analytics setup can't start until QA signs off. I'm also supposed to be doing performance testing but I can't context-switch right now.

--- Sarah Chen ---
Pricing page copy is at about 45% — I'm waiting on the marketing lead to sign off on the tier names before I can finish. The legal team has the ToS update but I haven't heard back yet. If I don't hear by tomorrow I'll chase.

--- Alex ---
Investor demo deck is at 60%. I still need the updated ARR chart from the dashboard for slide 4. Can someone pull that? Also, at this rate with the QA blocker, I think we need to have a serious conversation about the launch date — we may need to push by a week.

--- General discussion ---
Team agreed: the current deadline is unreachable with the QA blocker in place. Discussed pushing the target date by 7 days. Marcus will own QA full-time until resolved. Sarah to pick up performance testing once QA clears.
`.trim();

const CALENDAR_TRANSCRIPT = `
Q2 Launch Review — All Hands
Date: ${new Date().toLocaleDateString("en-GB")}
Attendees: Alex, Sarah Chen, Marcus Reid

This was a quick all-hands to review launch readiness. The team walked through each workstream:

Checkout (Marcus): QA blocker is the single critical path item. Until it clears, launch cannot proceed.

Pricing copy (Sarah): Blocked on external sign-off. Not on the critical path but needs to complete within the week.

Investor deck (Alex): 60% complete. On track if ARR data is available by tomorrow.

Decision: Team voted to extend the Q2 launch target by 7 days. This will be reflected in the project timeline once approved. Larry to raise a deadline change proposal in the Action Center.
`.trim();

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.close());

