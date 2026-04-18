#!/usr/bin/env node
/**
 * 12-scenario stress test for project-scoped invitations + invite_links.
 *
 * Usage:
 *   ADMIN_EMAIL=launch-test-2026@larry-pm.com \
 *   ADMIN_PASSWORD=TestLarry123% \
 *   API_BASE=https://larry-api-production.up.railway.app \
 *   WEB_BASE=https://larry-pm.com \
 *   PROJECT_ID=<uuid> \
 *   INVITEE_EMAIL=oreillferg3@gmail.com \
 *   node scripts/stress-test-invites.mjs
 *
 * Writes findings to docs/reports/TEST-REPORT-<date>-invites.md.
 *
 * This script is idempotent for read-only checks; it creates invites and
 * links under the admin tenant and labels them clearly so they can be
 * revoked via the admin UI afterward.
 */

import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_BASE = (process.env.API_BASE ?? "http://localhost:8080").replace(/\/+$/, "");
const WEB_BASE = (process.env.WEB_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const PROJECT_ID = process.env.PROJECT_ID ?? "";
const INVITEE_EMAIL = process.env.INVITEE_EMAIL ?? `stress+${Date.now()}@example.com`;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
  process.exit(2);
}

const results = [];

function record(name, ok, details) {
  results.push({ name, ok, details });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name} — ${JSON.stringify(details)}`);
}

async function apiFetch(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function login(email, password) {
  const { status, body } = await apiFetch("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (status !== 200 || !body.accessToken) {
    throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return { accessToken: body.accessToken, user: body.user };
}

async function main() {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Admin logged in: ${admin.user?.id} @ tenant ${admin.user?.tenantId}`);

  // ─── 1. Invite-only (no project): creates pending invitation, returns URL ────
  const unscopedInvite = await apiFetch("/v1/orgs/invitations", {
    method: "POST",
    token: admin.accessToken,
    body: { email: `unscoped-${Date.now()}@example.com`, role: "member" },
  });
  record("1. create tenant-only invite", unscopedInvite.status === 201, {
    status: unscopedInvite.status,
    hasUrl: Boolean(unscopedInvite.body?.inviteUrl),
  });

  // ─── 2. Project-scoped invite: triggers access check, stores project data ────
  if (PROJECT_ID) {
    const scopedInvite = await apiFetch("/v1/orgs/invitations", {
      method: "POST",
      token: admin.accessToken,
      body: {
        email: `scoped-${Date.now()}@example.com`,
        role: "member",
        projectId: PROJECT_ID,
        projectRole: "editor",
      },
    });
    record("2. create project-scoped invite", scopedInvite.status === 201, {
      status: scopedInvite.status,
      projectId: scopedInvite.body?.invitation?.projectId,
      projectRole: scopedInvite.body?.invitation?.projectRole,
    });

    // ─── 3. Preview returns project info ──────────────────────────────────────
    if (scopedInvite.body?.inviteUrl) {
      const token = new URL(scopedInvite.body.inviteUrl).searchParams.get("token");
      const preview = await apiFetch(
        `/v1/orgs/invitations/${encodeURIComponent(token)}`,
      );
      record("3. preview surfaces project", preview.status === 200 && Boolean(preview.body.projectName), {
        status: preview.status,
        projectName: preview.body.projectName,
      });
    }
  } else {
    console.log("PROJECT_ID unset — skipping scenarios 2 and 3.");
  }

  // ─── 4. Invite the user's real email (oreillferg3@gmail.com) ─────────────────
  const realInvite = await apiFetch("/v1/orgs/invitations", {
    method: "POST",
    token: admin.accessToken,
    body: {
      email: INVITEE_EMAIL,
      role: "member",
      ...(PROJECT_ID ? { projectId: PROJECT_ID, projectRole: "editor" } : {}),
    },
  });
  record(`4. invite ${INVITEE_EMAIL}`, realInvite.status === 201 || realInvite.status === 409, {
    status: realInvite.status,
    inviteUrl: realInvite.body?.inviteUrl,
    message: realInvite.body?.message,
  });

  // ─── 5. Create invite link (no project) ──────────────────────────────────────
  const linkUnscoped = await apiFetch("/v1/orgs/invite-links", {
    method: "POST",
    token: admin.accessToken,
    body: { defaultRole: "member", expiresInDays: 7 },
  });
  record("5. create invite link (unscoped)", linkUnscoped.status === 201, {
    status: linkUnscoped.status,
    url: linkUnscoped.body?.url,
  });

  // ─── 6. Create invite link scoped to project ─────────────────────────────────
  let scopedLinkUrl = null;
  let scopedLinkId = null;
  if (PROJECT_ID) {
    const linkScoped = await apiFetch("/v1/orgs/invite-links", {
      method: "POST",
      token: admin.accessToken,
      body: {
        defaultRole: "member",
        defaultProjectId: PROJECT_ID,
        defaultProjectRole: "editor",
        maxUses: 2,
        expiresInDays: 1,
      },
    });
    record("6. create project-scoped invite link", linkScoped.status === 201, {
      status: linkScoped.status,
      url: linkScoped.body?.url,
    });
    scopedLinkUrl = linkScoped.body?.url;
    scopedLinkId = linkScoped.body?.link?.id;
  }

  // ─── 7. Preview invite link ──────────────────────────────────────────────────
  if (scopedLinkUrl) {
    const token = scopedLinkUrl.split("/").pop();
    const preview = await apiFetch(
      `/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}`,
    );
    record("7. preview scoped invite link", preview.status === 200, {
      status: preview.status,
      tenantName: preview.body.tenantName,
      projectName: preview.body.projectName,
      usesRemaining: preview.body.usesRemaining,
    });
  }

  // ─── 8. Redeem invite link as a brand-new user ───────────────────────────────
  if (scopedLinkUrl) {
    const token = scopedLinkUrl.split("/").pop();
    const ephemeralEmail = `link-stress-${randomBytes(4).toString("hex")}@mailinator.com`;
    const redeem = await apiFetch(
      `/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}/redeem`,
      {
        method: "POST",
        body: { email: ephemeralEmail, password: "StressTestPass1!" },
      },
    );
    record("8. redeem invite link creates new user", redeem.status === 200, {
      status: redeem.status,
      userId: redeem.body?.userId,
      tenantId: redeem.body?.tenantId,
      email: ephemeralEmail,
    });

    // ─── 9. Redeem again with a SECOND fresh user — should succeed (maxUses=2) ─
    const ephemeralEmail2 = `link-stress-${randomBytes(4).toString("hex")}@mailinator.com`;
    const redeem2 = await apiFetch(
      `/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}/redeem`,
      {
        method: "POST",
        body: { email: ephemeralEmail2, password: "StressTestPass1!" },
      },
    );
    record("9. redeem second time (maxUses=2)", redeem2.status === 200, {
      status: redeem2.status,
    });

    // ─── 10. Third redeem should fail with 410 (exhausted) ────────────────────
    const ephemeralEmail3 = `link-stress-${randomBytes(4).toString("hex")}@mailinator.com`;
    const redeem3 = await apiFetch(
      `/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}/redeem`,
      {
        method: "POST",
        body: { email: ephemeralEmail3, password: "StressTestPass1!" },
      },
    );
    record("10. third redeem is refused (exhausted)", redeem3.status === 410, {
      status: redeem3.status,
    });
  }

  // ─── 11. Revoke a link → preview returns 410 revoked ─────────────────────────
  if (scopedLinkId && linkUnscoped.body?.link?.id) {
    const revoke = await apiFetch(
      `/v1/orgs/invite-links/${linkUnscoped.body.link.id}/revoke`,
      { method: "POST", token: admin.accessToken },
    );
    record("11a. revoke invite link", revoke.status === 200, { status: revoke.status });

    const token = linkUnscoped.body.url.split("/").pop();
    const preview = await apiFetch(
      `/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}`,
    );
    record("11b. revoked link preview returns 410", preview.status === 410, {
      status: preview.status,
      code: preview.body?.code,
    });
  }

  // ─── 12. Unknown token preview returns 404 ───────────────────────────────────
  const unknown = await apiFetch(
    `/v1/orgs/invite-links/by-token/${encodeURIComponent("unknowntokenxxxxx")}`,
  );
  record("12. unknown link preview returns 404", unknown.status === 404, {
    status: unknown.status,
  });

  // ─── Write report ────────────────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.resolve(`docs/reports/TEST-REPORT-${date}-invites.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const md = [
    `# Invites + Invite Links — Stress Test Report`,
    ``,
    `Date: ${date}  `,
    `API: \`${API_BASE}\`  `,
    `Project: \`${PROJECT_ID || "(unset)"}\`  `,
    `Admin: \`${ADMIN_EMAIL}\`  `,
    `Invitee under test: \`${INVITEE_EMAIL}\`  `,
    ``,
    `**Summary:** ${passed}/${results.length} passed, ${failed} failed.`,
    ``,
    `## Scenarios`,
    ``,
    ...results.map((r) =>
      `- **${r.ok ? "PASS" : "FAIL"} — ${r.name}**\n  \`\`\`json\n  ${JSON.stringify(r.details, null, 2)}\n  \`\`\``,
    ),
    ``,
  ].join("\n");
  await writeFile(reportPath, md, "utf8");
  console.log(`Report written to ${reportPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});
