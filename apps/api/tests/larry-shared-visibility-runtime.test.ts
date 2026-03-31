import { describe, expect, it, vi } from "vitest";
import {
  getLarryActionCentreData,
  getLarryConversationForUser,
  listLarryConversationPreviews,
  listLarryEventSummaries,
} from "../src/lib/larry-ledger.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CONVERSATION_ID = "66666666-6666-4666-8666-666666666666";

describe("Larry shared visibility runtime SQL", () => {
  it("uses project membership checks while keeping global conversations user-scoped", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await listLarryConversationPreviews(
      { queryTenant } as never,
      TENANT_ID,
      USER_ID,
      { projectId: PROJECT_ID, limit: 10 }
    );

    const sql = String(queryTenant.mock.calls[0]?.[1]);
    expect(sql).toContain("c.project_id IS NULL");
    expect(sql).toContain("AND c.user_id = $2");
    expect(sql).toContain("FROM project_memberships pm");
    expect(sql).toContain("pm.project_id = c.project_id");
    expect(sql).toContain("pm.user_id = $2");
  });

  it("uses the same membership predicate on conversation message reads", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await getLarryConversationForUser(
      { queryTenant } as never,
      TENANT_ID,
      USER_ID,
      CONVERSATION_ID
    );

    const sql = String(queryTenant.mock.calls[0]?.[1]);
    expect(sql).toContain("project_id IS NULL");
    expect(sql).toContain("AND user_id = $3");
    expect(sql).toContain("FROM project_memberships pm");
    expect(sql).toContain("pm.project_id = larry_conversations.project_id");
    expect(sql).toContain("pm.user_id = $3");
  });

  it("filters action-centre events by project membership when userId is supplied", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await listLarryEventSummaries(
      { queryTenant } as never,
      TENANT_ID,
      { userId: USER_ID }
    );

    const sql = String(queryTenant.mock.calls[0]?.[1]);
    expect(sql).toContain("FROM project_memberships pm");
    expect(sql).toContain("pm.project_id = e.project_id");
    expect(sql).toContain("pm.user_id = $2");
  });

  it("applies membership-filtered queries in global action-centre reads", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await getLarryActionCentreData(
      { queryTenant } as never,
      TENANT_ID,
      USER_ID
    );

    const eventSql1 = String(queryTenant.mock.calls[0]?.[1]);
    const eventSql2 = String(queryTenant.mock.calls[1]?.[1]);
    const convoSql = String(queryTenant.mock.calls[2]?.[1]);

    expect(eventSql1).toContain("pm.user_id = $2");
    expect(eventSql2).toContain("pm.user_id = $2");
    expect(convoSql).toContain("FROM project_memberships pm");
  });

  it("filters global conversation previews to active project threads while preserving general chats", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await listLarryConversationPreviews(
      { queryTenant } as never,
      TENANT_ID,
      USER_ID,
      { projectStatus: "active", limit: 10 }
    );

    const sql = String(queryTenant.mock.calls[0]?.[1]);
    expect(sql).toContain("LEFT JOIN projects project");
    expect(sql).toContain("c.project_id IS NULL OR CASE WHEN project.status = 'archived' THEN 'archived' ELSE 'active' END = $3");
  });

  it("adds active-project filtering to global action-centre reads only", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await getLarryActionCentreData(
      { queryTenant } as never,
      TENANT_ID,
      USER_ID,
      undefined,
      "active"
    );

    const eventSql1 = String(queryTenant.mock.calls[0]?.[1]);
    const eventSql2 = String(queryTenant.mock.calls[1]?.[1]);
    const convoSql = String(queryTenant.mock.calls[2]?.[1]);

    expect(eventSql1).toContain("CASE WHEN project.status = 'archived' THEN 'archived' ELSE 'active' END = $2");
    expect(eventSql2).toContain("CASE WHEN project.status = 'archived' THEN 'archived' ELSE 'active' END = $2");
    expect(convoSql).toContain("CASE WHEN project.status = 'archived' THEN 'archived' ELSE 'active' END = $3");
  });

  it("keeps project-scoped action-centre reads free of archive filters", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    await getLarryActionCentreData(
      { queryTenant } as never,
      TENANT_ID,
      USER_ID,
      PROJECT_ID,
      "active"
    );

    const eventSql1 = String(queryTenant.mock.calls[0]?.[1]);
    const eventSql2 = String(queryTenant.mock.calls[1]?.[1]);
    const convoSql = String(queryTenant.mock.calls[2]?.[1]);

    expect(eventSql1).not.toContain("project.status = 'archived'");
    expect(eventSql2).not.toContain("project.status = 'archived'");
    expect(convoSql).not.toContain("project.status = 'archived'");
  });
});
