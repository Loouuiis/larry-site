# Larry — Auth & Security

## Auth Architecture

**API auth** (`apps/api`): Fastify JWT plugin (`@fastify/jwt`). Registered in `apps/api/src/plugins/security.ts` — **no `namespace` option** (removing namespace was a critical fix; with namespace, `app.jwt.sign` is unavailable and login returns 500).

**Web auth** (`apps/web`): httpOnly signed session cookie. Session payload: `{ apiAccessToken, apiRefreshToken, tenantId, role, email }`.

## API Auth Routes

| Route | Notes |
|-------|-------|
| `POST /v1/auth/login` | Returns `accessToken` + `refreshToken`. Requires `x-tenant-id` header. |
| `POST /v1/auth/refresh` | Rotates access token using refresh token |
| `POST /v1/auth/logout` | Writes audit log. Does **not** revoke refresh tokens (known gap — must fix before launch) |
| `GET /v1/auth/me` | Returns current user from JWT |

## RBAC Roles

- `admin` — full access including connector management
- `pm` — project management access
- `viewer` — read-only

Connector install routes require `admin|pm` role.

## Multi-Tenant Isolation

- Every request is scoped by `tenant_id` (from JWT payload)
- DB queries use `fastify.db.queryTenant(tenantId, ...)` — enforces row-level security
- Webhooks use a system-level RLS policy (`app.tenant_id='__system__'`) to resolve workspace→tenant mapping

## Dev Credentials (local + staging)

| Field | Value |
|-------|-------|
| Tenant ID | `11111111-1111-4111-8111-111111111111` |
| Email | `sarah@larry.local` or `dev@larry.local` |
| Password | `DevPass123!` |

Dev bypass: `GET /api/auth/dev-login` (sets valid session cookie, no credentials needed).
**Do not enable in production.** Controlled by `ALLOW_DEV_AUTH_BYPASS=true` env var.

## Security Requirements (must be done before launch)

1. **Rate limiting on auth routes** — `/v1/auth/login` has no route-level rate limit. Add before production. `@fastify/rate-limit ^10.0.0` is installed (Fastify v5 compatible).
2. **Refresh token revocation on logout** — `POST /v1/auth/logout` currently only writes an audit log. Must invalidate refresh tokens.
3. **Health endpoint leakage** — `GET /api/health` must return only `{ ok: true }` — never URLs, tokens, or raw error strings.
4. **Dev session secret in production** — `apps/web/src/lib/session-secret.ts` has a hardcoded dev fallback. `SESSION_SECRET` must be set explicitly in all environments.
5. **Turso credentials** — legacy `apps/web/src/lib/db.ts` Turso client. Do not expose Turso credentials publicly; these routes should be migrated to the API bridge or gated.

## Known Gaps (post-launch backlog)

- Invite-based onboarding flow (currently seeded credentials only — no self-serve signup in workspace mode)
- Org invite approval flow exists at `POST /v1/orgs/request` + admin endpoints in `orgs.ts` — not yet wired to a complete invite/provision flow
- Audit log coverage review (Issue #31)
