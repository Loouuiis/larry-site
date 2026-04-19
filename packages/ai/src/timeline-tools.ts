import { tool } from "ai";
import { z } from "zod";
import type { Db } from "@larry/db";

// Zod v4 .uuid() uses strict RFC 4122 variant bits which rejects some valid
// Postgres-generated UUIDs (e.g. all-zero suffix). Use a regex that accepts
// any well-formed 8-4-4-4-12 hex UUID instead.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuid = () => z.string().regex(UUID_RE, "Invalid UUID");

export const TimelineRegroupArgsSchema = z.object({
  displayText: z.string().min(10).max(140),
  reasoning: z.string().min(20).max(600),
  createCategories: z
    .array(z.object({
      tempId: z.string().regex(/^cat_[a-z0-9]{4,12}$/),
      name: z.string().min(1).max(60),
      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }))
    .max(5)
    .optional(),
  moveProjects: z
    .array(
      z.object({
        projectId: uuid(),
        toCategoryTempId: z.string().optional(),
        toCategoryId: uuid().optional(),
      }).refine(
        (v) => (v.toCategoryTempId == null) !== (v.toCategoryId == null),
        "exactly one of toCategoryTempId / toCategoryId required",
      ),
    )
    .max(10)
    .optional(),
  recolourCategories: z
    .array(z.object({
      categoryId: uuid(),
      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }))
    .max(10)
    .optional(),
}).refine(
  (v) =>
    (v.createCategories?.length ?? 0)
    + (v.moveProjects?.length ?? 0)
    + (v.recolourCategories?.length ?? 0) >= 1,
  "At least one change is required",
);

export type TimelineRegroupArgs = z.infer<typeof TimelineRegroupArgsSchema>;

export interface TimelineToolContext {
  db: Db;
  tenantId: string;
}

export function buildProposeTimelineRegroupTool(ctx: TimelineToolContext) {
  return tool({
    description:
      "Propose grouping projects under new or existing categories, with optional " +
      "colour assignments. Only call when 3+ projects share strong signals " +
      "(meeting transcripts, task-title patterns, shared stakeholders). Do NOT " +
      "call if a similar timeline_regroup suggestion is already pending — see " +
      "pendingTimelineSuggestions in the context.",
    inputSchema: TimelineRegroupArgsSchema,
    execute: async (args): Promise<{ eventId: string; status: "pending" }> => {
      const rows = await ctx.db.queryTenant<{ id: string }>(
        ctx.tenantId,
        `INSERT INTO larry_events
           (tenant_id, project_id, event_type, action_type, display_text, reasoning,
            payload, triggered_by, execution_mode, source_kind)
         VALUES ($1, NULL, 'suggested', 'timeline_regroup', $2, $3, $4::jsonb,
                 'schedule', 'approval', 'schedule')
         RETURNING id`,
        [ctx.tenantId, args.displayText, args.reasoning, JSON.stringify(args)],
      );
      return { eventId: rows[0].id, status: "pending" };
    },
  });
}
