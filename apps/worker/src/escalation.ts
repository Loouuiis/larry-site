import { db } from "./context.js";

// Phase 8: Escalation scan — runs hourly to detect overdue / at-risk tasks
export async function runEscalationScan(): Promise<void> {
  try {
    const now = new Date();
    const cutoffInactivity = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const cutoff48h = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

    const tenantRows = await db.tx(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
      const r = await client.query<{ id: string }>("SELECT id FROM tenants");
      return r.rows;
    });

    for (const tenant of tenantRows) {
      const tenantId = tenant.id;

      type TaskRow = {
        id: string;
        title: string;
        status: string;
        due_date: string | null;
        start_date: string | null;
        progress_percent: number;
        updated_at: string;
        assignee_user_id: string | null;
      };

      const tasks = await db.queryTenant<TaskRow>(
        tenantId,
        `SELECT id, title, status, due_date, start_date, progress_percent, updated_at, assignee_user_id
         FROM tasks
         WHERE tenant_id = $1
           AND status NOT IN ('completed', 'backlog')`,
        [tenantId]
      );

      const notifications: Array<{
        userId: string | null;
        channel: string;
        subject: string;
        body: string;
        metadata: string;
      }> = [];

      for (const task of tasks) {
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const startDate = task.start_date ? new Date(task.start_date) : null;
        const updatedAt = new Date(task.updated_at);

        // Start reminder: start_date = today, status = not_started
        if (startDate && task.status === "not_started") {
          const startDay = new Date(startDate.toDateString());
          const today = new Date(now.toDateString());
          if (startDay.getTime() === today.getTime()) {
            notifications.push({
              userId: task.assignee_user_id,
              channel: "system",
              subject: `Task starting today: ${task.title}`,
              body: `Your task "${task.title}" is scheduled to start today.`,
              metadata: JSON.stringify({ taskId: task.id, type: "start_reminder" }),
            });
          }
        }

        // Inactivity warning: in_progress, no activity for 5+ days
        if (task.status === "in_progress" && updatedAt < cutoffInactivity) {
          notifications.push({
            userId: task.assignee_user_id,
            channel: "system",
            subject: `Inactivity warning: ${task.title}`,
            body: `Task "${task.title}" has had no activity for 5+ days.`,
            metadata: JSON.stringify({ taskId: task.id, type: "inactivity_warning" }),
          });
        }

        // Pre-deadline alert: due within 48h, progress < 70%
        if (dueDate && dueDate <= cutoff48h && dueDate > now && task.progress_percent < 70) {
          notifications.push({
            userId: task.assignee_user_id,
            channel: "system",
            subject: `Deadline approaching: ${task.title}`,
            body: `Task "${task.title}" is due within 48 hours but is only ${task.progress_percent}% complete.`,
            metadata: JSON.stringify({ taskId: task.id, type: "pre_deadline_alert" }),
          });
        }

        // Deadline breach: past due, not completed
        if (dueDate && dueDate < now && task.status !== "completed") {
          notifications.push({
            userId: task.assignee_user_id,
            channel: "system",
            subject: `Deadline breached: ${task.title}`,
            body: `Task "${task.title}" passed its due date of ${task.due_date} and is not yet complete.`,
            metadata: JSON.stringify({ taskId: task.id, type: "deadline_breach" }),
          });
        }
      }

      for (const notif of notifications) {
        try {
          await db.queryTenant(
            tenantId,
            `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, metadata)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT DO NOTHING`,
            [tenantId, notif.userId, notif.channel, notif.subject, notif.body, notif.metadata]
          );
        } catch {
          // ignore individual insert failures
        }
      }
    }

    console.log(`[escalation-scan] completed — checked ${tenantRows.length} tenants`);
  } catch (err) {
    console.error("[escalation-scan] error", err);
  }
}

