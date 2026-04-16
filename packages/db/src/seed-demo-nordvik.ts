/**
 * Nordvik — zeb compliance rollout demo seed.
 * Target: the VC demo video shoot (spec: docs/superpowers/specs/2026-04-16-vc-demo-video-design.md).
 *
 * Creates its own isolated tenant so nothing interferes with the existing Acme seed.
 *
 * Idempotent — safe to re-run. Every INSERT uses ON CONFLICT DO UPDATE / DO NOTHING.
 *
 * Run (local):        DATABASE_URL=postgres://... npx tsx packages/db/src/seed-demo-nordvik.ts
 * Run (production):   DATABASE_URL=$RAILWAY_DATABASE_PUBLIC_URL npx tsx packages/db/src/seed-demo-nordvik.ts
 *
 * Login on deployed site:
 *   larry@larry.com  /  DevPass123!      (admin backdoor)
 *   joel.okafor@zeb-consulting.demo  /  DevPass123!   (hero login for the shoot)
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

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

// ─── bcrypt hash for "DevPass123!" at 12 rounds (reused from seed.ts) ──────────
const PASSWORD_HASH = "$2b$12$SjkLUt9sfCzzTGw4k6YI3OLi9WO4FmUmJq.dcFssppzOOh1hj39by";

// ─── Stable IDs (prefix 9* so they do not collide with the Acme seed) ─────────
const T = "99999999-9999-4999-8999-999999999991"; // tenant

const U_LARRY   = "99999999-0000-4000-8000-000000000001"; // larry@larry.com (admin backdoor)
const U_JOEL    = "99999999-0000-4000-8000-000000000002"; // Joel Okafor — PM, hero on camera
const U_CLAIRE  = "99999999-0000-4000-8000-000000000003"; // Claire Beaumont — zeb Partner
const U_LARS    = "99999999-0000-4000-8000-000000000004"; // Lars Holm — Head of Risk
const U_PRIYA   = "99999999-0000-4000-8000-000000000005"; // Priya Shah — Data Lead
const U_MARCUS  = "99999999-0000-4000-8000-000000000006"; // Marcus Reinhardt — IT Ops Lead
const U_ELENA   = "99999999-0000-4000-8000-000000000007"; // Elena Fischer — Compliance Analyst
const U_TOMAS   = "99999999-0000-4000-8000-000000000008"; // Tomás Rivera — Junior Analyst

const P = "99999999-1111-4111-8111-000000000001"; // project

const MN = "99999999-2222-4222-8222-000000000001"; // meeting notes row (week 6 sync)

// Tasks (22). Workstream encoded in title prefix so the Gantt sorts cleanly:
//   [DM] Data Migration · [RM] Risk Modelling · [II] IT Integration · [SC] Stakeholder Communications
const TK = (n: number) =>
  `99999999-3333-4333-8333-0000000000${n.toString().padStart(2, "0")}`;

// Larry events (3 Action Centre cards awaiting approval)
const EV_DEADLINE = "99999999-4444-4444-8444-000000000001";
const EV_EMAIL    = "99999999-4444-4444-8444-000000000002";
const EV_OWNER    = "99999999-4444-4444-8444-000000000003";

// Canonical event that represents the meeting transcript ingest
const CE_MEETING = "99999999-5555-4555-8555-000000000001";

async function q(sql: string, values: unknown[] = []) {
  return db.query(sql, values);
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysAgoDate(n: number) {
  return daysAgo(n).slice(0, 10);
}
function daysFromNowDate(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Transcript (55-minute weekly workstream sync) ────────────────────────────
const MEETING_TRANSCRIPT = `Nordvik Bank — Regulatory Compliance Rollout
Weekly Workstream Sync — Week 6 of 12
Date: ${new Date().toLocaleDateString("en-GB")}
Duration: 55 minutes
Attendees: Joel Okafor (zeb PM), Claire Beaumont (zeb Partner), Lars Holm (Nordvik — Head of Risk), Priya Shah (Nordvik — Data Lead), Marcus Reinhardt (Nordvik — IT Ops Lead)

--- Joel Okafor ---
Morning everyone. Thanks for making the earlier slot work. Let's do the usual — each workstream, blockers and asks, then Claire has a steering item at the end. Priya, do you want to kick us off on Data Migration?

--- Priya Shah ---
Sure. Status: the legacy extraction finished cleanly two weeks ago, we've got a full snapshot of the exposure data from the core banking side sitting in the staging warehouse. The target schema is defined — that's signed off with regulatory. The live piece is the mapping work — translating the legacy fields into the new regulatory schema. That's the one I flagged in yellow last week and it's still yellow. We're at about 80% on the schema mapping document, but the last 20% is the tricky part — it's the fields that depend on the updated exposure model. Which brings me to my ask: Lars, I really need the updated PD/LGD model from your team by Thursday at the latest. Without the new exposure categories locked in, we can't finalise the mapping, and anything downstream of that — data quality validation, reconciliation — is on hold.

--- Lars Holm ---
Yeah, I hear you. So on our side — Risk Modelling — the stress scenario calibration is on track, we've got the new scenarios wired in, backtest is queued. The PD/LGD model for the retail portfolio is the one that's dragging. My team is waiting on the data cut — which, ironic, is waiting on your mapping. We're unblocked the moment we agree on a subset of exposure categories to run against. I can have the model ready by Thursday if you can agree to a reduced category list for the first pass. We'll iterate the second pass next week.

--- Priya Shah ---
Fine. Thursday works, reduced category list works. I'll send you the subset today.

--- Joel Okafor ---
Great. Logging that — Priya's team owes Lars the category list today, Lars's team delivers the PD/LGD model by Thursday, which unblocks the schema mapping. Marcus — IT Integration?

--- Marcus Reinhardt ---
Mostly on track but I want to flag something. The API design doc for the regulatory reporting endpoint is done, signed off. The sync job implementation — that's the one that was already red on the board — it's still red, we're about five days behind. The bigger issue, though, is the core banking vendor. We've been trying to get the production API credentials for three weeks now. They keep pushing the provisioning call. It's not a hard block yet because we can keep developing against the sandbox, but if the credentials don't land in the next week and a half, we're going to have an integration slip on our hands. I'm escalating on our side but wanted you all to know.

--- Joel Okafor ---
OK. That's a risk worth formal tracking. Can we put that on Marcus's sync-job task as a formal risk flag? So it's visible to steering.

--- Marcus Reinhardt ---
Yes please.

--- Claire Beaumont ---
On the slippage point — that ties into something I need to share. Lars, you and I spoke on Friday. Do you want to say it or should I?

--- Lars Holm ---
You go.

--- Claire Beaumont ---
OK. The regulator has pushed the review date. Our original target was six weeks from today. The new date is eight weeks from today — two-week extension. It's not because of us — they've got a resourcing issue on their side and they've pushed a handful of the smaller-bank reviews. I know it's welcome news in one sense — it gives us a bit more runway on the model work and the integration. But we need to formally shift our internal deadlines to match. Joel, can you update the project plan — everything downstream of the regulator review goes back by two weeks?

--- Joel Okafor ---
Will do. That needs approval from steering before I lock it in but I'll queue the change. It's a net positive for us — it takes the edge off the sync job and gives Marcus room to breathe on the credentials.

--- Marcus Reinhardt ---
Appreciated.

--- Joel Okafor ---
Stakeholder Comms from my side: the regulator kickoff letter went out week one, that's closed. The internal exec briefing deck v1 was delivered in week three. The weekly sync meetings like this one are running. The week 6 CFO update is still on my list — not started, due this week. The readiness submission pack is the big one for later in the programme. Nothing red in comms.

--- Claire Beaumont ---
That brings me to my ask. Given the deadline shift, I think Henrik needs a written update from us this week — not next. Joel, can you draft a note to Henrik summarising where we are at week 6, flag the two-week shift, and lay out the next two-week plan? Nothing long — four paragraphs, professional tone. I'd like to see a draft before it goes.

--- Joel Okafor ---
Yes, I'll draft it this afternoon and queue it for your review.

--- Claire Beaumont ---
Thank you.

--- Joel Okafor ---
Quick round of status updates while we're here —
Priya, schema doc is 80%, you said?

--- Priya Shah ---
Eighty.

--- Joel Okafor ---
Lars, the PD/LGD retail model is blocked on the data cut, which we just unblocked.

--- Lars Holm ---
Correct.

--- Joel Okafor ---
Marcus, the sync job is still five days behind.

--- Marcus Reinhardt ---
Five days, yes.

--- Joel Okafor ---
On my side the regulator kickoff letter is sent — closing that out. The exec briefing deck v1 is delivered. And the weekly sync meeting is running — this one counts.

--- Claire Beaumont ---
One more — Tomás has been doubling up on the validation prep and the risk register. Joel, I'd like us to look at whether Elena picks up the internal model validation review. Tomás is stretched, Elena has the compliance background for it. Worth considering.

--- Joel Okafor ---
I'll flag it as a proposed reassignment and let you two decide. OK — anything else? No? Good meeting. Thanks all.

--- End of meeting ---
`;

// ─── CFO email body (will be read on camera — keep it tight, well-written) ────
const CFO_EMAIL_BODY = `Dear Henrik,

A short written update from the Regulatory Compliance Rollout at week 6 of 12, ahead of your Monday readout.

On progress: the data migration workstream has extracted the full exposure dataset and agreed the target regulatory schema; the schema mapping is at 80% and will complete on Thursday once the updated retail PD/LGD model is delivered. Risk Modelling's stress scenario calibration is on track, and the updated exposure model is on the critical path for the remainder of this week. IT Integration's design work is signed off; the live piece is the exposure data sync job, which is currently five days behind — we have a recovery plan and expect to close the gap within the extended window (see below).

On timing: the EBA regulator has rescheduled our review by two weeks. The new target date is eight weeks from today. This is a net positive — it absorbs the current sync-job slippage and gives us a cleaner runway for model validation and the submission pack. I will re-baseline the downstream plan once the change is formally approved at steering.

On risk: one item worth your awareness. The core banking vendor has been slow to provision the production API credentials. We are developing against sandbox in the meantime and escalating on both sides, but if credentials do not land within the next ten days we will need to revisit the integration timeline.

Next steps from me: I will circulate the re-baselined plan by end of week and a short written update to the board ahead of your next steering. Happy to take this live if you would prefer a 20-minute walk-through.

Best,
Joel Okafor
Project Manager, zeb
`;

async function seed() {
  console.log("Seeding Nordvik × zeb compliance demo...\n");

  // ── Tenant ──────────────────────────────────────────────────────────────────
  await q(
    `INSERT INTO tenants (id, name, slug, region)
     VALUES ($1, 'Nordvik × zeb Compliance', 'nordvik-zeb', 'eu-west-1')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [T]
  );
  console.log("✓ Tenant: Nordvik × zeb Compliance");

  // ── Users ──────────────────────────────────────────────────────────────────
  const users: Array<[string, string, string]> = [
    [U_LARRY,  "larry@larry.com",                     "Larry (Admin)"],
    [U_JOEL,   "joel.okafor@zeb-consulting.demo",     "Joel Okafor"],
    [U_CLAIRE, "claire.beaumont@zeb-consulting.demo", "Claire Beaumont"],
    [U_LARS,   "lars.holm@nordvik.demo",              "Lars Holm"],
    [U_PRIYA,  "priya.shah@nordvik.demo",             "Priya Shah"],
    [U_MARCUS, "marcus.reinhardt@nordvik.demo",       "Marcus Reinhardt"],
    [U_ELENA,  "elena.fischer@nordvik.demo",          "Elena Fischer"],
    [U_TOMAS,  "tomas.rivera@zeb-consulting.demo",    "Tomás Rivera"],
  ];
  for (const [id, email, name] of users) {
    await q(
      `INSERT INTO users (id, email, password_hash, display_name, is_active, email_verified_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         email_verified_at = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at)`,
      [id, email, PASSWORD_HASH, name]
    );
  }
  // Separately ensure email uniqueness didn't hit an existing row from another tenant
  // (safe: same password hash, same display name).
  console.log("✓ Users: 8 (larry@larry.com, Joel, Claire, Lars, Priya, Marcus, Elena, Tomás)");

  // ── Memberships ────────────────────────────────────────────────────────────
  const memberships: Array<[string, string]> = [
    [U_LARRY,  "admin"],
    [U_JOEL,   "pm"],
    [U_CLAIRE, "pm"],
    [U_LARS,   "member"],
    [U_PRIYA,  "member"],
    [U_MARCUS, "member"],
    [U_ELENA,  "member"],
    [U_TOMAS,  "member"],
  ];
  for (const [uid, role] of memberships) {
    await q(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [T, uid, role]
    );
  }
  console.log("✓ Memberships set");

  // ── Tenant policy settings ─────────────────────────────────────────────────
  await q(
    `INSERT INTO tenant_policy_settings (tenant_id, low_impact_min_confidence, medium_impact_min_confidence, auto_execute_low_impact)
     VALUES ($1, 0.75, 0.90, true)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [T]
  );

  // ── Project ────────────────────────────────────────────────────────────────
  await q(
    `INSERT INTO projects (id, tenant_id, name, description, owner_user_id, status, risk_score, risk_level, start_date, target_date)
     VALUES ($1, $2,
       'Nordvik Bank — Regulatory Compliance Rollout',
       '12-week engagement preparing Nordvik Bank (mid-sized Nordic retail/commercial bank) for the new EBA stress-testing framework review. Four workstreams: Data Migration, Risk Modelling, IT Integration, Stakeholder Communications.',
       $3, 'active', 46.00, 'medium', $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       owner_user_id = EXCLUDED.owner_user_id,
       status = EXCLUDED.status,
       risk_score = EXCLUDED.risk_score,
       risk_level = EXCLUDED.risk_level,
       start_date = EXCLUDED.start_date,
       target_date = EXCLUDED.target_date`,
    [P, T, U_JOEL, daysAgoDate(42), daysFromNowDate(42)]
  );
  console.log("✓ Project: Nordvik Bank — Regulatory Compliance Rollout (12 weeks, week 6)");

  // ── Project memberships ─────────────────────────────────────────────────────
  const projRoles: Array<[string, string]> = [
    [U_JOEL,   "owner"],
    [U_LARRY,  "editor"],
    [U_CLAIRE, "editor"],
    [U_LARS,   "editor"],
    [U_PRIYA,  "editor"],
    [U_MARCUS, "editor"],
    [U_ELENA,  "editor"],
    [U_TOMAS,  "editor"],
  ];
  for (const [uid, role] of projRoles) {
    await q(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, project_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
      [T, P, uid, role]
    );
  }
  console.log("✓ Project memberships seeded");

  // ── Tasks (22) ─────────────────────────────────────────────────────────────
  // [id, title, description, status, priority, assignee, progress, risk_score, risk_level, start_date, due_date]
  type TaskRow = [
    string, string, string,
    "not_started" | "in_progress" | "waiting" | "completed" | "blocked" | "backlog",
    "low" | "medium" | "high" | "critical",
    string, number, number, "low" | "medium" | "high",
    string, string
  ];

  const tasks: TaskRow[] = [
    // Completed (6)
    [TK(1),  "[DM] Extract exposure data from core banking system",          "Full snapshot of the retail and commercial exposure dataset extracted from the core banking system into the regulatory staging warehouse.",                             "completed",   "high",     U_PRIYA,  100, 0,   "low",    daysAgoDate(38), daysAgoDate(28)],
    [TK(2),  "[DM] Define target regulatory schema",                         "Sign off the field list and data types for the new regulatory reporting schema. Reviewed with Lars's team and the external regulator liaison.",                         "completed",   "high",     U_PRIYA,  100, 0,   "low",    daysAgoDate(35), daysAgoDate(21)],
    [TK(3),  "[RM] Portfolio segmentation and scope definition",             "Agree the portfolio segments and exposure categories in scope for the new stress testing framework.",                                                                  "completed",   "high",     U_LARS,   100, 0,   "low",    daysAgoDate(35), daysAgoDate(25)],
    [TK(4),  "[II] API design doc for regulatory reporting endpoint",        "Interface contract between the core banking system and the regulatory reporting system. Signed off by architecture.",                                                 "completed",   "medium",   U_MARCUS, 100, 0,   "low",    daysAgoDate(35), daysAgoDate(21)],
    [TK(5),  "[SC] Regulator kickoff letter",                                "Formal engagement letter sent to the regulator confirming project scope, timeline, and point of contact.",                                                             "completed",   "high",     U_JOEL,   100, 0,   "low",    daysAgoDate(40), daysAgoDate(38)],
    [TK(6),  "[SC] Internal exec briefing deck v1",                          "First cut of the internal exec briefing deck — scope, governance, risk register, and 12-week plan. Delivered to Henrik and the ExCo.",                                "completed",   "high",     U_JOEL,   100, 0,   "low",    daysAgoDate(28), daysAgoDate(21)],

    // In progress — on-track green (5)
    [TK(7),  "[DM] Map legacy schema fields to new regulatory schema",       "Field-by-field translation document between the legacy exposure schema and the new regulatory schema. At 80% — last 20% depends on the updated PD/LGD categories.",  "in_progress", "high",     U_PRIYA,   80, 28,  "low",    daysAgoDate(14), daysFromNowDate(3)],
    [TK(8),  "[RM] Stress scenario calibration",                             "Calibrate the new stress scenarios (macro, idiosyncratic) against the agreed portfolio segmentation.",                                                                  "in_progress", "high",     U_LARS,    55, 20,  "low",    daysAgoDate(10), daysFromNowDate(7)],
    [TK(9),  "[SC] Weekly workstream sync (standing)",                       "Standing cross-workstream sync. Runs weekly for the duration of the engagement.",                                                                                      "in_progress", "medium",   U_JOEL,    50, 10,  "low",    daysAgoDate(42), daysFromNowDate(42)],
    [TK(10), "[RM] Backtest against historical portfolio data",              "Run the updated PD/LGD model against three years of historical retail portfolio data and compare realised vs predicted outcomes.",                                     "in_progress", "medium",   U_LARS,    25, 18,  "low",    daysAgoDate(3),  daysFromNowDate(14)],
    [TK(11), "[II] Draft production cutover runbook",                        "Document the cutover sequence between sandbox and production — prerequisites, sequencing, rollback triggers, observability.",                                           "in_progress", "medium",   U_MARCUS,  30, 15,  "low",    daysAgoDate(4),  daysFromNowDate(18)],

    // In progress — at-risk yellow (2)
    [TK(12), "[RM] Build updated PD/LGD model for retail portfolio",         "Updated probability of default and loss-given-default model for the retail portfolio. Blocked on the agreed category list; first pass due Thursday.",                   "in_progress", "critical", U_LARS,    40, 58,  "medium", daysAgoDate(14), daysFromNowDate(1)],
    [TK(13), "[II] Core banking vendor API credentials — procurement",       "Obtain production API credentials from the core banking vendor. Three weeks in; vendor provisioning has slipped twice. Escalated on both sides.",                      "in_progress", "high",     U_MARCUS,  40, 52,  "medium", daysAgoDate(21), daysFromNowDate(5)],

    // In progress — delayed red (1)
    [TK(14), "[II] Implement exposure data sync job",                        "Sync job that moves mapped exposure data from the warehouse into the regulatory reporting system on the agreed cadence. Five days behind schedule.",                   "in_progress", "high",     U_MARCUS,  35, 76,  "high",   daysAgoDate(10), daysFromNowDate(5)],

    // Not started (6)
    [TK(15), "[DM] Reconciliation reports",                                  "Automated reconciliation between legacy and new regulatory schemas, row-level and aggregate. Targets <0.01% variance.",                                                "not_started", "medium",   U_PRIYA,    0, 8,   "low",    daysFromNowDate(5),  daysFromNowDate(18)],
    [TK(16), "[DM] Data governance sign-off",                                "Formal sign-off from the data governance council on the migrated dataset.",                                                                                             "not_started", "high",     U_PRIYA,    0, 6,   "low",    daysFromNowDate(18), daysFromNowDate(24)],
    [TK(17), "[RM] Internal model validation review",                        "Independent internal validation of the updated PD/LGD and stress model. Currently owned by Tomás; capacity flagged in week 6 sync — Elena proposed.",                  "not_started", "high",     U_TOMAS,    0, 14,  "low",    daysFromNowDate(10), daysFromNowDate(24)],
    [TK(18), "[II] End-to-end integration testing",                          "Full end-to-end test of the core banking → warehouse → regulatory reporting chain against a known-good dataset.",                                                     "not_started", "high",     U_MARCUS,   0, 10,  "low",    daysFromNowDate(12), daysFromNowDate(24)],
    [TK(19), "[SC] Draft CFO briefing deck — week 6 update",                 "Formal CFO briefing deck covering week 6 status, regulator deadline shift, critical risks, and next two-week plan. Due this week.",                                    "not_started", "high",     U_JOEL,     0, 12,  "low",    daysFromNowDate(1),  daysFromNowDate(6)],
    [TK(20), "[SC] Regulator readiness submission pack",                     "Full submission pack for the regulator review — technical evidence, methodology, validation results, attestations.",                                                   "not_started", "critical", U_JOEL,     0, 6,   "low",    daysFromNowDate(24), daysFromNowDate(38)],

    // Blocked on dependencies (2)
    [TK(21), "[DM] Data quality validation",                                 "Automated DQ validation suite against the new schema. Blocked until the schema mapping is finalised.",                                                                 "blocked",     "high",     U_PRIYA,    0, 22,  "medium", daysFromNowDate(3),  daysFromNowDate(12)],
    [TK(22), "[SC] Post-submission board summary",                           "Short board summary following regulator submission. Blocked until the submission pack is finalised.",                                                                 "blocked",     "medium",   U_JOEL,     0, 4,   "low",    daysFromNowDate(38), daysFromNowDate(42)],
  ];

  for (const [id, title, desc, status, priority, assignee, progress, rs, rl, start, due] of tasks) {
    await q(
      `INSERT INTO tasks (id, tenant_id, project_id, title, description, status, priority, assignee_user_id,
         created_by_user_id, progress_percent, risk_score, risk_level, start_date, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         assignee_user_id = EXCLUDED.assignee_user_id,
         progress_percent = EXCLUDED.progress_percent,
         risk_score = EXCLUDED.risk_score,
         risk_level = EXCLUDED.risk_level,
         start_date = EXCLUDED.start_date,
         due_date = EXCLUDED.due_date,
         updated_at = NOW()`,
      [id, T, P, title, desc, status, priority, assignee, U_JOEL, progress, rs, rl, start, due]
    );
  }
  console.log("✓ Tasks: 22 (6 completed · 8 in progress · 6 not started · 2 blocked)");

  // ── Task dependencies (4, 3 cross-workstream) ──────────────────────────────
  // #7  [DM map schema]     depends on #12 [RM PD/LGD model]       cross: DM ← RM
  // #14 [II sync job]       depends on #7  [DM map schema]         cross: II ← DM
  // #21 [DM data quality]   depends on #7  [DM map schema]         within DM
  // #19 [SC CFO deck]       depends on #12 [RM PD/LGD model]       cross: SC ← RM
  const deps: Array<[string, string]> = [
    [TK(7),  TK(12)],
    [TK(14), TK(7)],
    [TK(21), TK(7)],
    [TK(19), TK(12)],
  ];
  for (const [taskId, dependsOn] of deps) {
    await q(
      `INSERT INTO task_dependencies (tenant_id, task_id, depends_on_task_id, relation)
       VALUES ($1, $2, $3, 'finish_to_start')
       ON CONFLICT (tenant_id, task_id, depends_on_task_id) DO NOTHING`,
      [T, taskId, dependsOn]
    );
  }
  console.log("✓ Task dependencies: 4 (3 cross-workstream)");

  // ── Task comments (make it feel lived-in) ──────────────────────────────────
  const comments: Array<[string, string, string, string]> = [
    [TK(7),  U_PRIYA,  "Schema doc is at 80%. Last 20% is the regulatory-categories section — pending Lars's updated PD/LGD categories.", daysAgo(2)],
    [TK(7),  U_LARS,   "Subset categories going to you today so you can close the mapping by Thursday.", daysAgo(1)],
    [TK(12), U_LARS,   "Model is ready in shape. We're holding on a reduced category list for the first pass; full categories in pass two.", daysAgo(1)],
    [TK(13), U_MARCUS, "Third call with the vendor today. They're now saying Thursday. Escalating internally.", daysAgo(3)],
    [TK(14), U_MARCUS, "Five days behind. Recovery plan: parallelise the data-quality hooks once schema mapping lands.", daysAgo(1)],
    [TK(19), U_JOEL,   "Drafting this afternoon. Will circulate to Claire for review before it goes to Henrik.", daysAgo(0)],
  ];
  for (const [taskId, author, body, ts] of comments) {
    await q(
      `INSERT INTO task_comments (tenant_id, project_id, task_id, author_user_id, body, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [T, P, taskId, author, body, ts]
    );
  }
  console.log("✓ Task comments: 6");

  // ── Canonical event (meeting transcript ingest) ────────────────────────────
  await q(
    `INSERT INTO canonical_events (id, tenant_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
     VALUES ($1, $2, 'transcript', 'nordvik-week6-sync', 'transcript.submitted', $3, 0.95, $4, $5::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
    [CE_MEETING, T, "joel.okafor@zeb-consulting.demo", daysAgo(0), JSON.stringify({
      projectId: P,
      meetingTitle: "Nordvik Bank — Week 6 Workstream Sync",
      transcriptLength: MEETING_TRANSCRIPT.length,
    })]
  );

  // ── Meeting notes (transcript pre-attached to the project) ─────────────────
  await q(
    `INSERT INTO meeting_notes (id, tenant_id, project_id, agent_run_id, title, transcript, summary, action_count, meeting_date, created_by_user_id, created_at)
     VALUES ($1, $2, $3, NULL,
       'Nordvik Bank — Week 6 Workstream Sync',
       $4, $5, 3, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       transcript = EXCLUDED.transcript,
       summary = EXCLUDED.summary,
       action_count = EXCLUDED.action_count,
       meeting_date = EXCLUDED.meeting_date`,
    [
      MN, T, P,
      MEETING_TRANSCRIPT,
      "Week 6 sync of the Nordvik regulatory rollout. Priya and Lars agreed a reduced category list to unblock the schema mapping by Thursday. Regulator pushed the review by two weeks — downstream deadlines need to shift. Marcus flagged vendor credential slippage as a material risk. Claire asked for a written update to Henrik (CFO) this week. Tomás reassignment to Elena on the validation review proposed.",
      daysAgoDate(0),
      U_JOEL,
      daysAgo(0),
    ]
  );
  console.log("✓ Meeting notes: week 6 sync (transcript pre-attached)");

  // ── Auto-applied canonical work derived from the transcript ────────────────
  // (The spec calls for 6 status updates + 1 dependency link + 1 risk flag already applied.)
  // We log these as activity_log entries for the audit trail. The actual state changes
  // are baked into the task rows above (e.g. #14 sync job has risk_level='high').
  await q(
    `INSERT INTO activity_log (tenant_id, project_id, task_id, actor_user_id, activity_type, payload, created_at)
     VALUES
       ($1, $2, $3,  $4, 'task.status_updated', $5::jsonb, NOW()),
       ($1, $2, $6,  $4, 'task.status_updated', $7::jsonb, NOW()),
       ($1, $2, $8,  $4, 'task.status_updated', $9::jsonb, NOW()),
       ($1, $2, $10, $4, 'task.status_updated', $11::jsonb, NOW()),
       ($1, $2, $12, $4, 'task.status_updated', $13::jsonb, NOW()),
       ($1, $2, $14, $4, 'task.status_updated', $15::jsonb, NOW()),
       ($1, $2, $16, $4, 'task.risk_flag_added',   $17::jsonb, NOW()),
       ($1, $2, $18, $4, 'task.dependency_added',  $19::jsonb, NOW())
     ON CONFLICT DO NOTHING`,
    [
      T, P,
      TK(7),  U_JOEL, JSON.stringify({ source: "meeting_transcript", note: "schema doc at 80%" }),
      TK(12),         JSON.stringify({ source: "meeting_transcript", note: "PD/LGD ready pending reduced category list" }),
      TK(14),         JSON.stringify({ source: "meeting_transcript", note: "sync job still five days behind" }),
      TK(5),          JSON.stringify({ source: "meeting_transcript", note: "regulator kickoff letter confirmed sent" }),
      TK(6),          JSON.stringify({ source: "meeting_transcript", note: "exec briefing deck v1 delivered" }),
      TK(9),          JSON.stringify({ source: "meeting_transcript", note: "weekly sync — week 6 complete" }),
      TK(14),         JSON.stringify({ source: "meeting_transcript", flag: "vendor_credential_slippage", impact: "integration timeline" }),
      TK(7),          JSON.stringify({ source: "meeting_transcript", dependsOn: TK(12), due: "Thursday" }),
    ]
  );
  console.log("✓ Activity log: 6 auto status updates + 1 risk flag + 1 dependency link");

  // ── Three Action Centre cards awaiting Joel's approval ─────────────────────
  // Card 1 — Deadline shift (regulator pushed review by 2 weeks)
  await q(
    `INSERT INTO larry_events
       (id, tenant_id, project_id, event_type, action_type, display_text, reasoning, payload,
        triggered_by, execution_mode, source_kind, source_record_id, created_at)
     VALUES ($1, $2, $3, 'suggested', 'deadline_change',
       'Shift regulator review target from 6 weeks out to 8 weeks out, and re-baseline all downstream deadlines by +2 weeks',
       'Lars confirmed in the week 6 sync that the regulator has rescheduled the review by two weeks. Team agreed to absorb the shift; needs formal approval before the downstream plan is locked in.',
       $4::jsonb, 'signal', 'approval', 'meeting_note', $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       event_type = EXCLUDED.event_type,
       display_text = EXCLUDED.display_text,
       reasoning = EXCLUDED.reasoning,
       payload = EXCLUDED.payload`,
    [
      EV_DEADLINE, T, P,
      JSON.stringify({
        projectId: P,
        projectName: "Nordvik Bank — Regulatory Compliance Rollout",
        oldTargetDate: daysFromNowDate(42),
        newTargetDate: daysFromNowDate(56),
        shiftDays: 14,
        reason: "Regulator rescheduled the review by two weeks.",
        affectedTaskIds: [TK(15), TK(16), TK(17), TK(18), TK(19), TK(20), TK(22)],
      }),
      MN, daysAgo(0),
    ]
  );

  // Card 2 — Email draft to CFO
  await q(
    `INSERT INTO larry_events
       (id, tenant_id, project_id, event_type, action_type, display_text, reasoning, payload,
        triggered_by, execution_mode, source_kind, source_record_id, created_at)
     VALUES ($1, $2, $3, 'suggested', 'email_draft',
       'Send week 6 update to Henrik Sandberg (CFO, Nordvik Bank) — covers progress, regulator shift, risks, next steps',
       'Claire asked Joel in the week 6 sync to send Henrik a written update this week. Draft summarises week 6 progress and the two-week regulator shift.',
       $4::jsonb, 'signal', 'approval', 'meeting_note', $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       event_type = EXCLUDED.event_type,
       display_text = EXCLUDED.display_text,
       reasoning = EXCLUDED.reasoning,
       payload = EXCLUDED.payload`,
    [
      EV_EMAIL, T, P,
      JSON.stringify({
        recipient: "henrik.sandberg@nordvik.demo",
        recipientName: "Henrik Sandberg",
        recipientRole: "CFO, Nordvik Bank",
        cc: ["claire.beaumont@zeb-consulting.demo"],
        subject: "Week 6 update — Regulatory Compliance Rollout",
        body: CFO_EMAIL_BODY,
        senderUserId: U_JOEL,
      }),
      MN, daysAgo(0),
    ]
  );

  // Card 3 — Ownership reassignment (Tomás → Elena on the validation review)
  await q(
    `INSERT INTO larry_events
       (id, tenant_id, project_id, event_type, action_type, display_text, reasoning, payload,
        triggered_by, execution_mode, source_kind, source_record_id, created_at)
     VALUES ($1, $2, $3, 'suggested', 'owner_change',
       'Reassign "Internal model validation review" from Tomás Rivera to Elena Fischer',
       'Tomás is stretched across validation prep and the risk register. Elena has the compliance background to pick up the model validation review. Claire raised this in the week 6 sync.',
       $4::jsonb, 'signal', 'approval', 'meeting_note', $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       event_type = EXCLUDED.event_type,
       display_text = EXCLUDED.display_text,
       reasoning = EXCLUDED.reasoning,
       payload = EXCLUDED.payload`,
    [
      EV_OWNER, T, P,
      JSON.stringify({
        taskId: TK(17),
        taskTitle: "[RM] Internal model validation review",
        fromUserId: U_TOMAS,
        fromUserName: "Tomás Rivera",
        toUserId: U_ELENA,
        toUserName: "Elena Fischer",
        rationale: "Capacity + compliance expertise match.",
      }),
      MN, daysAgo(0),
    ]
  );
  console.log("✓ Action Centre: 3 cards awaiting approval (deadline shift · CFO email · reassignment)");

  // ── Risk snapshots ─────────────────────────────────────────────────────────
  await q(
    `INSERT INTO risk_snapshots (tenant_id, project_id, task_id, risk_score, risk_level, signals, created_at)
     VALUES
       ($1, $2, $3, 76, 'high',   '{"behind_schedule_days":5,"vendor_credential_slippage":true}'::jsonb, NOW()),
       ($1, $2, $4, 58, 'medium', '{"blocked_on_data_cut":true,"due_in_days":1}'::jsonb, NOW()),
       ($1, $2, $5, 52, 'medium', '{"vendor_provisioning_slow":true,"escalated":true}'::jsonb, NOW())
     ON CONFLICT DO NOTHING`,
    [T, P, TK(14), TK(12), TK(13)]
  );
  console.log("✓ Risk snapshots seeded");

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Nordvik demo seed complete.

  Tenant:       Nordvik × zeb Compliance
  Project:      Nordvik Bank — Regulatory Compliance Rollout
                (12 weeks · currently in week 6)

  Logins (password: DevPass123!):
    • larry@larry.com                        — admin backdoor
    • joel.okafor@zeb-consulting.demo        — hero login for the shoot
    • claire.beaumont@zeb-consulting.demo    — zeb Partner
    • lars.holm@nordvik.demo                 — Head of Risk
    • priya.shah@nordvik.demo                — Data Lead
    • marcus.reinhardt@nordvik.demo          — IT Ops Lead
    • elena.fischer@nordvik.demo             — Compliance Analyst
    • tomas.rivera@zeb-consulting.demo       — Junior Analyst

  On the deployed site, log in as either larry@larry.com or
  joel.okafor@zeb-consulting.demo to see:
    ✓ 22 tasks across 4 workstreams on the Gantt
    ✓ The week 6 sync transcript pre-attached to the project
    ✓ 3 Action Centre cards awaiting approval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
