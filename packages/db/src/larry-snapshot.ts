import type {
  ProjectActivityEntry,
  ProjectMemoryEntry,
  ProjectSignal,
  ProjectSnapshot,
  ProjectTaskSnapshot,
  ProjectTeamMember,
} from "@larry/shared";
import { Db } from "./client.js";

// ── Raw DB row types ──────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: string;
  risk_score: string;
  risk_level: string;
  start_date: string | null;
  target_date: string | null;
  larryContext: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  progress_percent: number;
  risk_score: string;
  risk_level: string;
  due_date: string | null;
  start_date: string | null;
  updated_at: string;
}

interface DependencyRow {
  task_id: string;
  depends_on_title: string;
}

interface MemberRow {
  user_id: string;
  display_name: string | null;
  email: string;
  role: string;
  active_task_count: string;
}

interface ActivityRow {
  activity_type: string;
  task_title: string | null;
  actor_name: string | null;
  created_at: string;
}

// ── Snapshot assembler ────────────────────────────────────────────────────────

/**
 * Assemble a full ProjectSnapshot from the database.
 * This is the primary input to runIntelligence().
 *
 * @param db       Db instance
 * @param tenantId Tenant scope — all queries are tenant-isolated
 * @param projectId The project to snapshot
 * @param signals  Optional external signals (Slack messages, calendar events, etc.)
 */
export async function getProjectSnapshot(
  db: Db,
  tenantId: string,
  projectId: string,
  signals: ProjectSignal[] = []
): Promise<ProjectSnapshot> {
  // Run project, tasks, members, activity, and memory in parallel
  const [projectRows, taskRows, dependencyRows, memberRows, activityRows, memoryRows] = await Promise.all([
    db.query<ProjectRow>(
      `SELECT id, tenant_id, name, description, status, risk_score, risk_level,
              start_date::text, target_date::text,
              larry_context AS "larryContext"
       FROM projects
       WHERE id = $1 AND tenant_id = $2`,
      [projectId, tenantId]
    ),

    db.query<TaskRow>(
      `SELECT
         t.id,
         t.title,
         t.description,
         t.status,
         t.priority,
         t.assignee_user_id AS assignee_id,
         u.display_name AS assignee_name,
         t.progress_percent,
         t.risk_score,
         t.risk_level,
         t.due_date::text,
         t.start_date::text,
         t.updated_at::text
       FROM tasks t
       LEFT JOIN users u ON t.assignee_user_id = u.id
       WHERE t.project_id = $1 AND t.tenant_id = $2
       ORDER BY t.created_at ASC`,
      [projectId, tenantId]
    ),

    db.query<DependencyRow>(
      `SELECT td.task_id, t2.title AS depends_on_title
       FROM task_dependencies td
       JOIN tasks t2 ON td.depends_on_task_id = t2.id
       WHERE td.tenant_id = $1
         AND td.task_id IN (
           SELECT id FROM tasks WHERE project_id = $2 AND tenant_id = $1
         )`,
      [tenantId, projectId]
    ),

    db.query<MemberRow>(
      `SELECT
         candidates.user_id,
         u.display_name,
         u.email,
         candidates.role,
         COUNT(t.id) FILTER (
           WHERE t.project_id = $2
             AND t.status NOT IN ('completed')
         ) AS active_task_count
       FROM (
         -- Project members with their project-scoped role
         SELECT pm.user_id, pm.role
         FROM project_memberships pm
         WHERE pm.tenant_id = $1 AND pm.project_id = $2

         UNION

         -- Task assignees who have work on this project but may lack an explicit membership row
         SELECT DISTINCT t2.assignee_user_id AS user_id, 'member' AS role
         FROM tasks t2
         WHERE t2.project_id = $2
           AND t2.tenant_id = $1
           AND t2.assignee_user_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM project_memberships pm2
             WHERE pm2.tenant_id = $1
               AND pm2.project_id = $2
               AND pm2.user_id = t2.assignee_user_id
           )
       ) AS candidates
       JOIN users u ON u.id = candidates.user_id
       LEFT JOIN tasks t ON t.assignee_user_id = candidates.user_id AND t.tenant_id = $1
       GROUP BY candidates.user_id, u.display_name, u.email, candidates.role`,
      [tenantId, projectId]
    ),

    db.query<ActivityRow>(
      `SELECT
         al.activity_type,
         t.title AS task_title,
         u.display_name AS actor_name,
         al.created_at::text
       FROM activity_log al
       LEFT JOIN tasks t ON al.task_id = t.id
       LEFT JOIN users u ON al.actor_user_id = u.id
       WHERE al.project_id = $1 AND al.tenant_id = $2
         AND al.created_at > NOW() - INTERVAL '7 days'
       ORDER BY al.created_at DESC
       LIMIT 20`,
      [projectId, tenantId]
    ),

    db.query<{ id: string; source: string; source_kind: string; source_record_id: string | null; content: string; created_at: string }>(
      `SELECT id, source, source_kind, source_record_id, content, created_at::text
       FROM project_memory_entries
       WHERE tenant_id = $1 AND project_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId, projectId]
    ),
  ]);

  if (projectRows.length === 0) {
    throw new Error(`Project ${projectId} not found for tenant ${tenantId}`);
  }

  const project = projectRows[0];

  // Build dependency lookup: taskId → [dependsOnTitle, ...]
  const dependencyMap = new Map<string, string[]>();
  for (const dep of dependencyRows) {
    const existing = dependencyMap.get(dep.task_id) ?? [];
    existing.push(dep.depends_on_title);
    dependencyMap.set(dep.task_id, existing);
  }

  const tasks: ProjectTaskSnapshot[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assignee_id,
    assigneeName: t.assignee_name,
    progressPercent: t.progress_percent,
    riskScore: parseFloat(t.risk_score),
    riskLevel: t.risk_level,
    dueDate: t.due_date,
    startDate: t.start_date,
    lastActivityAt: t.updated_at,
    dependsOnTitles: dependencyMap.get(t.id) ?? [],
  }));

  const team: ProjectTeamMember[] = memberRows.map((m) => ({
    id: m.user_id,
    name: m.display_name ?? m.email,
    email: m.email,
    role: m.role,
    activeTaskCount: parseInt(m.active_task_count, 10),
  }));

  const recentActivity: ProjectActivityEntry[] = activityRows.map((a) => ({
    description: formatActivityDescription(a),
    timestamp: a.created_at,
  }));

  const memoryEntries: ProjectMemoryEntry[] = memoryRows.map((r) => ({
    id: r.id,
    tenantId,
    projectId,
    source: r.source,
    sourceKind: r.source_kind,
    sourceRecordId: r.source_record_id,
    content: r.content,
    createdAt: r.created_at,
  }));

  return {
    project: {
      id: project.id,
      tenantId: project.tenant_id,
      name: project.name,
      description: project.description,
      status: project.status,
      riskScore: parseFloat(project.risk_score),
      riskLevel: project.risk_level,
      startDate: project.start_date,
      targetDate: project.target_date,
    },
    tasks,
    team,
    recentActivity,
    signals,
    memoryEntries,
    larryContext: project.larryContext ?? null,
    generatedAt: new Date().toISOString(),
  };
}

const LARRY_CONTEXT_MAX_CHARS = 6_000;

export async function updateProjectLarryContext(
  db: Db,
  tenantId: string,
  projectId: string,
  context: string,
): Promise<void> {
  // Load existing context so we can append
  const rows = await db.queryTenant<{ larry_context: string | null }>(
    tenantId,
    `SELECT larry_context FROM projects WHERE tenant_id = $1 AND id = $2`,
    [tenantId, projectId],
  );
  const existing = rows[0]?.larry_context ?? "";
  const datestamp = new Date().toISOString().slice(0, 10);
  const newEntry = `[${datestamp}] ${context.trim()}`;

  let merged = existing ? `${existing}\n${newEntry}` : newEntry;

  // If over the cap, trim the oldest entries (lines from the top)
  while (merged.length > LARRY_CONTEXT_MAX_CHARS) {
    const firstNewline = merged.indexOf("\n");
    if (firstNewline === -1) {
      // Single entry that's too long — truncate it
      merged = merged.slice(0, LARRY_CONTEXT_MAX_CHARS);
      break;
    }
    merged = merged.slice(firstNewline + 1);
  }

  await db.queryTenant(
    tenantId,
    `UPDATE projects SET larry_context = $2, updated_at = NOW() WHERE tenant_id = $1 AND id = $3`,
    [tenantId, merged, projectId],
  );
}

function formatActivityDescription(row: ActivityRow): string {
  const actor = row.actor_name ?? "Someone";
  const task = row.task_title ? `"${row.task_title}"` : "a task";

  switch (row.activity_type) {
    case "task_created":     return `${actor} created ${task}`;
    case "task_completed":   return `${actor} completed ${task}`;
    case "task_status_changed": return `${actor} updated status of ${task}`;
    case "task_assigned":    return `${actor} was assigned to ${task}`;
    case "task_commented":   return `${actor} commented on ${task}`;
    case "project_created":  return `${actor} created the project`;
    case "larry_action":     return `Larry acted on ${task}`;
    default:                 return `${actor} made a change to ${task}`;
  }
}
