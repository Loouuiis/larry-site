# Tenant Switcher + Invite Short-Circuit — Prod Verification

Date: 2026-04-18
PR: #124 (merged as master `@~HEAD`)

## Root cause summary
Anton (`anton.gong.05@gmail.com`) has memberships in two tenants:

| tenant | role | created_at |
|---|---|---|
| `f8faa2d7-cbc6-4149-8760-fdeb3348cb0e` "Anton Gong" | owner | 2026-04-08 |
| `34df5f91-15ca-446f-8d5f-b096d3cc321f` "ANTONIO GONGU" | member | 2026-04-18 |

`apps/api/src/routes/v1/auth.ts:244-250` resolves login tenant via
`ORDER BY m.created_at ASC LIMIT 1` → Anton lands in the older tenant,
where projects from the newer tenant are invisible. No UI existed to
switch workspaces. Additionally, inviting a user who's already a tenant
member to a new project returned a confusing 409.

## Prod verification scenarios

### 1. `GET /v1/auth/tenants` returns membership list (200)
```
{
  "tenants": [
    { "tenantId": "5d7cd81b...", "name": "Launch Test Org", "role": "admin", "current": true },
    { "tenantId": "63510b69...", "name": "Fergus OReilly", "role": "member", "current": false }
  ]
}
```
PASS.

### 2. `POST /v1/auth/switch-tenant` happy path
Before: `/v1/projects` returns 5 projects (Launch Test Org).
After switch to `63510b69...`: `/v1/projects` returns `["Larry PM"]` only.
PASS.

### 3. Switch-tenant security + validation
- Switch to a tenant you're not in → **403 Forbidden** "You are not a member of that workspace." PASS.
- Switch to your current tenant → **400** "Already on this tenant." PASS.
- Switch with a non-UUID → **400** "Invalid UUID." PASS.

### 4. Invite short-circuit (project + existing member)
```
POST /v1/orgs/invitations  { email: existingMember, role: member, projectId, projectRole: editor }
→ 200 { added: true, userId, projectId, projectRole: "editor" }
```
Subsequent `GET /v1/projects/:id/members` confirms the invitee appears as `editor`.
PASS.

### 5. Invite short-circuit preserves legacy 409
Same email without `projectId` → **409 "already a member of this workspace."**
PASS.

## Test artefacts
- Temp project `2270fb41-7b92-4639-beb4-abaf40b80648` ("ShortCircuit Verify 2026-04-18") in Launch Test Org tenant, with `link-stress-87b2e8ac@mailinator.com` as editor.
- Temporary second membership on launch-test-2026 (→ Fergus OReilly tenant) added for end-to-end proof, rolled back after verification.

## Summary
5/5 PASS on live prod (Railway). Single-tenant users see no UI change; multi-tenant users see a topbar switcher. The 409 that blocked Fergus's workaround is replaced by a direct project add when `projectId` is present.
