import { FastifyPluginAsync } from "fastify";
import type {
  PortfolioTimelineResponse, PortfolioTimelineCategory,
  PortfolioTimelineProject, GanttTask,
} from "@larry/shared";

type CatRow = {
  id: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  parentCategoryId: string | null;
  projectId: string | null;
};
type ProjRow = {
  id: string; name: string; status: "active" | "archived";
  startDate: string | null; targetDate: string | null; categoryId: string | null;
};

export const timelineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/timeline", { preHandler: [fastify.authenticate] }, async (request): Promise<PortfolioTimelineResponse> => {
    const tenantId = request.user.tenantId;

    const [categoriesRaw, projectsRaw, tasksRaw, depsRaw] = await Promise.all([
      fastify.db.queryTenant<CatRow>(tenantId,
        `SELECT id, name, colour, sort_order AS "sortOrder",
                parent_category_id AS "parentCategoryId",
                project_id         AS "projectId"
           FROM project_categories WHERE tenant_id = $1
           ORDER BY sort_order ASC, created_at ASC`, [tenantId]),
      fastify.db.queryTenant<ProjRow>(tenantId,
        `SELECT id, name, status,
                start_date::text AS "startDate",
                target_date::text AS "targetDate",
                category_id AS "categoryId"
           FROM projects WHERE tenant_id = $1
           ORDER BY name ASC`, [tenantId]),
      fastify.db.queryTenant<GanttTask & { assigneeName: string | null }>(tenantId,
        `SELECT tasks.id,
                tasks.project_id    AS "projectId",
                tasks.parent_task_id AS "parentTaskId",
                tasks.title,
                tasks.status::text  AS status,
                tasks.priority::text AS priority,
                tasks.assignee_user_id AS "assigneeUserId",
                COALESCE(NULLIF(users.display_name, ''), split_part(users.email, '@', 1)) AS "assigneeName",
                tasks.start_date::text AS "startDate",
                tasks.due_date::text   AS "endDate",
                tasks.due_date::text   AS "dueDate",
                tasks.progress_percent AS "progressPercent"
           FROM tasks
           LEFT JOIN users ON users.id = tasks.assignee_user_id
           WHERE tasks.tenant_id = $1
             AND tasks.start_date IS NOT NULL
             AND tasks.due_date   IS NOT NULL
           ORDER BY tasks.project_id, tasks.created_at ASC`, [tenantId]),
      fastify.db.queryTenant<{ taskId: string; dependsOnTaskId: string; relation: string }>(tenantId,
        `SELECT task_id AS "taskId", depends_on_task_id AS "dependsOnTaskId", relation
           FROM task_dependencies WHERE tenant_id = $1`, [tenantId]),
    ]);

    const tasksByProject = new Map<string, GanttTask[]>();
    for (const t of tasksRaw) {
      const list = tasksByProject.get(t.projectId) ?? [];
      list.push(t);
      tasksByProject.set(t.projectId, list);
    }

    const projectsByCategory = new Map<string | null, PortfolioTimelineProject[]>();
    for (const p of projectsRaw) {
      const list = projectsByCategory.get(p.categoryId) ?? [];
      list.push({
        id: p.id, name: p.name, status: p.status,
        startDate: p.startDate, targetDate: p.targetDate,
        tasks: tasksByProject.get(p.id) ?? [],
      });
      projectsByCategory.set(p.categoryId, list);
    }

    const categories: PortfolioTimelineCategory[] = categoriesRaw.map(c => ({
      id: c.id, name: c.name, colour: c.colour, sortOrder: c.sortOrder,
      parentCategoryId: c.parentCategoryId,
      projectId: c.projectId,
      projects: projectsByCategory.get(c.id) ?? [],
    }));

    const uncategorised = projectsByCategory.get(null) ?? [];
    if (uncategorised.length > 0) {
      categories.push({
        id: null, name: "Uncategorised", colour: null,
        sortOrder: Number.MAX_SAFE_INTEGER, projects: uncategorised,
      });
    }

    return { categories, dependencies: depsRaw };
  });
};
