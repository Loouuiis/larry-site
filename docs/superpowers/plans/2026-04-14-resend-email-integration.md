# Resend Email Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up production Resend email delivery using verified domain `larry-site.com` with two senders (`noreply@` for security, `larry@` for product), shared `RESEND_API_KEY` across Vercel (web) + Railway (api + worker), with TDD coverage on the FROM mapping.

**Architecture:** Replace the single hardcoded `FROM` in `apps/api/src/lib/email.ts` and the single `RESEND_FROM` env var with a pair: `RESEND_FROM_NOREPLY` and `RESEND_FROM_LARRY`. Each of the 6 transactional functions, the worker escalation, and the web referral route maps to the appropriate sender. Existing `isResendConfigured()` console-log fallback is preserved as a kill switch.

**Tech Stack:** TypeScript, Node.js, Resend SDK (`resend` npm package), Vitest, Zod, Fastify v5 (api), Next.js 16 (web), BullMQ (worker), Vercel + Railway hosting.

**Spec:** `docs/superpowers/specs/2026-04-14-resend-email-integration-design.md`

---

## File Structure

**Will modify:**
- `packages/config/src/index.ts` — Zod schemas for ApiEnv and WorkerEnv
- `apps/api/src/lib/email.ts` — 6 transactional email functions
- `apps/worker/src/escalation.ts` — escalation alert email (worker)
- `apps/web/src/app/api/referral/route.ts` — referral email (Next.js route)
- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/worker/.env.example`
- `docs/CONNECTORS.md` (if it has Resend specifics)

**Will create:**
- `apps/api/src/lib/email.test.ts` — unit tests asserting FROM mapping
- `scripts/test-resend.ts` — local integration script (deleted before commit)

**Will NOT modify:**
- Worker raw-fetch Resend call structure (only the FROM env var name changes)
- Any AI / chat / connector code (unrelated)
- `apps/api/src/lib/email.ts` HTML templates (out of scope)

---

## Pre-implementation gate

**This entire plan blocks on the user completing Phase A from the spec.** Before starting Task 1, the user must:

1. Sign up at resend.com using GitHub `led1299`.
2. Add `larry-site.com` as a domain in Resend, configure DNS (SPF/DKIM/DMARC), wait for all 3 records to verify green.
3. Create an API key named `larry-prod`, scoped to `larry-site.com`, with `Sending access` permission.
4. Provide the API key to the executor (paste in chat OR write to `apps/api/.env.local`).

**Code tasks (1–6) can begin in parallel with Phase A** — they don't need the API key. **Tasks 7+ require the key in hand.**

---

## Task 1: Create feature branch

**Files:** none modified, branch only.

- [ ] **Step 1: Verify clean working tree on master**

Run: `cd /c/Dev/larry/site-deploys/larry-site && git status --short`
Expected: only untracked QA report files (`docs/reports/qa-2026-04-12/*`); no modified tracked files. If anything else, stop and ask.

- [ ] **Step 2: Pull latest master**

Run: `cd /c/Dev/larry/site-deploys/larry-site && git pull origin master`
Expected: Already up to date OR fast-forward.

- [ ] **Step 3: Create and switch to feature branch**

Run: `cd /c/Dev/larry/site-deploys/larry-site && git checkout -b feat/resend-integration`
Expected: `Switched to a new branch 'feat/resend-integration'`

- [ ] **Step 4: Verify branch**

Run: `cd /c/Dev/larry/site-deploys/larry-site && git branch --show-current`
Expected: `feat/resend-integration`

---

## Task 2: Update Zod env schemas (api + worker)

**Files:**
- Modify: `packages/config/src/index.ts` (ApiSchema and WorkerSchema)

- [ ] **Step 1: Update ApiSchema — add two FROM vars**

In `packages/config/src/index.ts`, find the `ApiSchema` block and locate this line:

```ts
RESEND_API_KEY: z.string().optional(),
```

Replace it with:

```ts
RESEND_API_KEY: z.string().optional(),
RESEND_FROM_NOREPLY: z.string().default("Larry <noreply@larry-site.com>"),
RESEND_FROM_LARRY: z.string().default("Larry <larry@larry-site.com>"),
```

- [ ] **Step 2: Update WorkerSchema — replace RESEND_FROM with the two new vars**

In the `WorkerSchema` block, find:

```ts
RESEND_API_KEY: z.string().optional(),
RESEND_FROM: z.string().default("Larry <noreply@larry.app>"),
```

Replace with:

```ts
RESEND_API_KEY: z.string().optional(),
RESEND_FROM_NOREPLY: z.string().default("Larry <noreply@larry-site.com>"),
RESEND_FROM_LARRY: z.string().default("Larry <larry@larry-site.com>"),
```

- [ ] **Step 3: Type-check the package**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc -p packages/config/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add packages/config/src/index.ts && \
git commit -m "feat(config): add RESEND_FROM_NOREPLY and RESEND_FROM_LARRY env vars

Replaces single RESEND_FROM with a noreply/larry pair so security and
product emails can be sent from distinct addresses on larry-site.com."
```

---

## Task 3: Write FAILING unit tests for email.ts FROM mapping

**Files:**
- Create: `apps/api/src/lib/email.test.ts`

- [ ] **Step 1: Create the test file**

Create `apps/api/src/lib/email.test.ts` with this content:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const NOREPLY = "Larry <noreply@larry-site.com>";
const LARRY = "Larry <larry@larry-site.com>";

describe("email.ts FROM mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "test-id" }, error: null });
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_NOREPLY = NOREPLY;
    process.env.RESEND_FROM_LARRY = LARRY;
    process.env.FRONTEND_URL = "https://app.example.com";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_NOREPLY;
    delete process.env.RESEND_FROM_LARRY;
    delete process.env.FRONTEND_URL;
  });

  it("sendPasswordResetEmail uses noreply sender", async () => {
    const mod = await import("./email");
    await mod.sendPasswordResetEmail("u@example.com", "https://x/reset");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendVerificationEmail uses noreply sender", async () => {
    const mod = await import("./email");
    await mod.sendVerificationEmail("u@example.com", "https://x/verify");
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendEmailChangeConfirmation uses noreply sender", async () => {
    const mod = await import("./email");
    await mod.sendEmailChangeConfirmation("u@example.com", "https://x/confirm");
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendEmailChangeNotification uses noreply sender", async () => {
    const mod = await import("./email");
    await mod.sendEmailChangeNotification("u@example.com");
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendNewDeviceAlert uses noreply sender", async () => {
    const mod = await import("./email");
    await mod.sendNewDeviceAlert("u@example.com", { browser: "Chrome", os: "macOS" });
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendMemberInviteEmail uses larry sender", async () => {
    const mod = await import("./email");
    await mod.sendMemberInviteEmail("u@example.com", "Anna");
    expect(sendMock.mock.calls[0][0].from).toBe(LARRY);
  });
});
```

- [ ] **Step 2: Run the tests — they MUST fail**

Run: `cd /c/Dev/larry/site-deploys/larry-site/apps/api && npx vitest run src/lib/email.test.ts`

Expected: All 6 tests fail with assertions like:
```
AssertionError: expected 'Larry <noreply@larry.app>' to be 'Larry <noreply@larry-site.com>'
```

If tests pass, the test file is wrong — fix it before continuing. The whole point is that the tests assert the NEW behaviour against the OLD code.

---

## Task 4: Implement email.ts FROM mapping (make tests pass)

**Files:**
- Modify: `apps/api/src/lib/email.ts`

- [ ] **Step 1: Replace the single FROM constant**

In `apps/api/src/lib/email.ts`, find:

```ts
const FROM = "Larry <noreply@larry.app>";
```

Replace with:

```ts
const FROM_NOREPLY = process.env.RESEND_FROM_NOREPLY ?? "Larry <noreply@larry-site.com>";
const FROM_LARRY   = process.env.RESEND_FROM_LARRY   ?? "Larry <larry@larry-site.com>";
```

- [ ] **Step 2: Update each `from: FROM` to the correct constant**

In the same file, swap each function's `from:` line:

| Function | New `from:` value |
|---|---|
| `sendPasswordResetEmail` | `from: FROM_NOREPLY,` |
| `sendVerificationEmail` | `from: FROM_NOREPLY,` |
| `sendEmailChangeConfirmation` | `from: FROM_NOREPLY,` |
| `sendEmailChangeNotification` | `from: FROM_NOREPLY,` |
| `sendNewDeviceAlert` | `from: FROM_NOREPLY,` |
| `sendMemberInviteEmail` | `from: FROM_LARRY,` |

There are exactly 6 occurrences of `from: FROM,` in the file. Each must be replaced.

- [ ] **Step 3: Re-run the tests — they MUST pass**

Run: `cd /c/Dev/larry/site-deploys/larry-site/apps/api && npx vitest run src/lib/email.test.ts`

Expected: 6 passed, 0 failed.

- [ ] **Step 4: Run the full api test suite to catch regressions**

Run: `cd /c/Dev/larry/site-deploys/larry-site/apps/api && npx vitest run`

Expected: all tests pass. If any unrelated test fails, do NOT fix it as part of this task — note it and continue.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add apps/api/src/lib/email.ts apps/api/src/lib/email.test.ts && \
git commit -m "feat(email): split FROM into noreply/larry pair with mapping tests

Auth/security emails (password reset, verification, email change,
new-device alert) use noreply@larry-site.com. Workspace invites use
larry@larry-site.com. Adds vitest coverage asserting each function
calls Resend with the correct from address."
```

---

## Task 5: Update worker escalation.ts FROM env var

**Files:**
- Modify: `apps/worker/src/escalation.ts`

- [ ] **Step 1: Find the existing FROM line**

Run: `cd /c/Dev/larry/site-deploys/larry-site && grep -n "RESEND_FROM" apps/worker/src/escalation.ts`
Expected: one line at ~223 showing `from: env.RESEND_FROM,`

- [ ] **Step 2: Swap to RESEND_FROM_LARRY**

In `apps/worker/src/escalation.ts`, replace:

```ts
from: env.RESEND_FROM,
```

with:

```ts
from: env.RESEND_FROM_LARRY,
```

- [ ] **Step 3: Type-check the worker**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc -p apps/worker/tsconfig.json --noEmit`
Expected: no errors. (The Zod schema change in Task 2 already added `RESEND_FROM_LARRY` to `WorkerEnv`, so the type is available.)

- [ ] **Step 4: Run worker tests**

Run: `cd /c/Dev/larry/site-deploys/larry-site/apps/worker && npx vitest run`
Expected: all tests pass. If any test asserts on `RESEND_FROM`, update it to `RESEND_FROM_LARRY` and re-run.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add apps/worker/src/escalation.ts && \
git commit -m "feat(worker): use RESEND_FROM_LARRY for escalation alerts

Escalations are Larry-voiced product comms; they belong on the
larry@ sender, not noreply@."
```

---

## Task 6: Fix web referral route FROM (also fixes existing broken sender)

**Files:**
- Modify: `apps/web/src/app/api/referral/route.ts`

**Why this matters:** Current code has `from: "Larry <noreply@larry-site.vercel.app>"` — that's a Vercel preview hostname which can't be SPF-aligned. Referral emails currently can't deliver. This task fixes both that and the new sender mapping.

- [ ] **Step 1: Replace the hardcoded FROM**

In `apps/web/src/app/api/referral/route.ts`, find line 63:

```ts
from: "Larry <noreply@larry-site.vercel.app>",
```

Replace with:

```ts
from: process.env.RESEND_FROM_LARRY ?? "Larry <larry@larry-site.com>",
```

- [ ] **Step 2: Type-check the web app**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add apps/web/src/app/api/referral/route.ts && \
git commit -m "fix(web): use larry@larry-site.com for referral emails

Previous hardcoded sender was noreply@larry-site.vercel.app — a Vercel
preview hostname that cannot be SPF-aligned, so referral emails would
never deliver. Switch to the larry@ sender on the verified domain."
```

---

## Task 7: Update .env.example files

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `apps/web/.env.example`
- Modify: `apps/worker/.env.example`

- [ ] **Step 1: Update apps/api/.env.example**

Find the line:
```
RESEND_API_KEY=
```

Replace with:
```
RESEND_API_KEY=
RESEND_FROM_NOREPLY=Larry <noreply@larry-site.com>
RESEND_FROM_LARRY=Larry <larry@larry-site.com>
```

- [ ] **Step 2: Update apps/web/.env.example**

Find the line:
```
RESEND_API_KEY=
```

Replace with:
```
RESEND_API_KEY=
RESEND_FROM_NOREPLY=Larry <noreply@larry-site.com>
RESEND_FROM_LARRY=Larry <larry@larry-site.com>
```

- [ ] **Step 3: Update apps/worker/.env.example**

Find these two lines:
```
RESEND_API_KEY=
RESEND_FROM=Larry <noreply@yourdomain.com>
```

Replace with:
```
RESEND_API_KEY=
RESEND_FROM_NOREPLY=Larry <noreply@larry-site.com>
RESEND_FROM_LARRY=Larry <larry@larry-site.com>
```

- [ ] **Step 4: Commit**

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add apps/api/.env.example apps/web/.env.example apps/worker/.env.example && \
git commit -m "docs(env): document RESEND_FROM_NOREPLY and RESEND_FROM_LARRY"
```

---

## Task 8: Update docs (CONNECTORS.md, SECURITY-REVIEW.md)

**Files:**
- Modify: `docs/CONNECTORS.md` (if it mentions `RESEND_FROM` or `larry.app`)
- Modify: `SECURITY-REVIEW.md` (only references to `larry.app` as email FROM, NOT other contexts)

- [ ] **Step 1: Search both files**

Run: `cd /c/Dev/larry/site-deploys/larry-site && grep -nE "RESEND_FROM|larry\.app" docs/CONNECTORS.md SECURITY-REVIEW.md`

- [ ] **Step 2: Update each match**

For each line found, judge case-by-case:
- If it describes the email **FROM address** (e.g., "emails sent from `noreply@larry.app`"), update to `larry-site.com`.
- If it references `larry.app` as a URL, marketing domain, or unrelated context, **leave it alone**.
- If it mentions `RESEND_FROM` env var, update to mention the new pair `RESEND_FROM_NOREPLY` + `RESEND_FROM_LARRY`.

- [ ] **Step 3: Commit (only if changes were made)**

If no changes needed, skip. Otherwise:

```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add docs/CONNECTORS.md SECURITY-REVIEW.md && \
git commit -m "docs: update Resend references to larry-site.com domain"
```

---

## Task 9: Push branch and gate on Resend account/key

**Files:** none.

- [ ] **Step 1: Push branch to origin**

Run: `cd /c/Dev/larry/site-deploys/larry-site && git push -u origin feat/resend-integration`
Expected: branch published.

- [ ] **Step 2: Verify CI passes on the branch**

Run: `cd /c/Dev/larry/site-deploys/larry-site && gh run list --branch feat/resend-integration --limit 3`
Wait until the latest "Backend CI" run shows `completed success`. If it fails, investigate the failure (likely a test that hardcodes `larry.app` or `RESEND_FROM`) and fix before continuing.

- [ ] **Step 3: GATE — confirm Resend setup is complete**

Before continuing, the user must confirm:
- ✓ Resend account created via GitHub `led1299`
- ✓ Domain `larry-site.com` verified (all 3 DNS records green in Resend dashboard)
- ✓ API key `larry-prod` created with sending access scoped to `larry-site.com`
- ✓ API key in hand (pasted in chat OR written to `apps/api/.env.local`)

If any of the above isn't true, STOP and surface the gap to the user.

---

## Task 10: Inject env vars on Vercel and Railway

**Files:** none (env-only).

- [ ] **Step 1: Verify Vercel CLI is linked to the larry-site project**

Run: `cd /c/Dev/larry/site-deploys/larry-site && vercel link --yes`
Expected: confirms link to `loouuiis-projects/ailarry`.

- [ ] **Step 2: Add vars to Vercel — production env**

For each of these three vars, run `vercel env add <NAME> production` and paste the value when prompted:

- `RESEND_API_KEY` → the key from Resend dashboard
- `RESEND_FROM_NOREPLY` → `Larry <noreply@larry-site.com>`
- `RESEND_FROM_LARRY` → `Larry <larry@larry-site.com>`

- [ ] **Step 3: Add vars to Vercel — preview env**

Repeat Step 2 with `vercel env add <NAME> preview` for each of the three vars (same values).

- [ ] **Step 4: Verify Vercel vars**

Run: `cd /c/Dev/larry/site-deploys/larry-site && vercel env ls`
Expected: all three vars present in both `Production` and `Preview` columns.

- [ ] **Step 5: Verify Railway CLI is linked to the api service**

Run: `cd /c/Dev/larry/site-deploys/larry-site && railway status`
Expected: shows linked project and service. If not, run `railway link` and select the api service.

- [ ] **Step 6: Set vars on Railway api service**

Run:
```bash
railway variables --set "RESEND_API_KEY=<KEY>" \
  --set "RESEND_FROM_NOREPLY=Larry <noreply@larry-site.com>" \
  --set "RESEND_FROM_LARRY=Larry <larry@larry-site.com>"
```

- [ ] **Step 7: Switch to worker service and set vars**

Run: `railway service` → select worker service.

Then:
```bash
railway variables --set "RESEND_API_KEY=<KEY>" \
  --set "RESEND_FROM_NOREPLY=Larry <noreply@larry-site.com>" \
  --set "RESEND_FROM_LARRY=Larry <larry@larry-site.com>"
```

- [ ] **Step 8: Verify Railway vars on both services**

For each of api and worker:
Run: `railway variables | grep RESEND`
Expected: all three vars present.

- [ ] **Step 9: Trigger Railway redeploy if vars didn't auto-apply**

If the most recent Railway deployment for either service predates the variable changes:
Run: `railway up --detach` (from the relevant service context)
Wait until the deployment shows `SUCCESS` in `railway status`.

---

## Task 11: Local integration test (real Resend, real domain)

**Files:**
- Create: `scripts/test-resend.ts` (deleted at end of task — DO NOT commit)

- [ ] **Step 1: Create the script**

Create `scripts/test-resend.ts` with this content (replace `YOUR_EMAIL` with the user's actual email):

```ts
import "dotenv/config";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendEmailChangeConfirmation,
  sendEmailChangeNotification,
  sendNewDeviceAlert,
  sendMemberInviteEmail,
} from "../apps/api/src/lib/email";

const TO = process.env.TEST_RESEND_TO;
if (!TO) {
  console.error("Set TEST_RESEND_TO=your@email.com");
  process.exit(1);
}

async function run() {
  console.log("→ password reset");
  await sendPasswordResetEmail(TO, "https://larry-site.com/reset?token=test");

  console.log("→ verification");
  await sendVerificationEmail(TO, "https://larry-site.com/verify?token=test");

  console.log("→ email change confirm");
  await sendEmailChangeConfirmation(TO, "https://larry-site.com/confirm-email?token=test");

  console.log("→ email change notification");
  await sendEmailChangeNotification(TO);

  console.log("→ new device alert");
  await sendNewDeviceAlert(TO, { browser: "Chrome 130", os: "Windows 11", ip: "127.0.0.1", location: "Dublin, IE" });

  console.log("→ member invite");
  await sendMemberInviteEmail(TO, "Anna");

  console.log("All 6 sent. Check your inbox AND Resend dashboard logs.");
}

run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the script**

Ensure `apps/api/.env.local` has `RESEND_API_KEY=<key>` (or set it inline). Then:

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
TEST_RESEND_TO=<your-email> npx tsx scripts/test-resend.ts
```

Expected: 6 lines of `→ ...` output and `All 6 sent.`

- [ ] **Step 3: Verify in inbox**

Open the test inbox. Confirm:
- All 6 emails arrived (not in spam).
- 5 are from `Larry <noreply@larry-site.com>`; 1 (member invite) from `Larry <larry@larry-site.com>`.
- HTML renders correctly with the purple Larry "L" badge.
- Links in CTAs point to `https://larry-site.com/...`.

If any are in spam: mark as "Not spam," let inbox provider learn. If still landing in spam after multiple sends, investigate DMARC/SPF alignment in Resend dashboard before continuing.

- [ ] **Step 4: Verify in Resend dashboard**

Open https://resend.com/emails. Confirm for each of the 6 sends:
- Status = `Delivered`
- SPF, DKIM, DMARC indicators all green.

If any status is `Bounced` or `Failed`, capture the error reason and STOP — debug before deploying to production.

- [ ] **Step 5: Delete the script**

Run: `cd /c/Dev/larry/site-deploys/larry-site && rm scripts/test-resend.ts`

Verify: `git status --short` should show no `scripts/test-resend.ts` (was untracked, now gone).

---

## Task 12: Merge to master and deploy

**Files:** none.

- [ ] **Step 1: Open PR from feat/resend-integration → master**

Run:
```bash
cd /c/Dev/larry/site-deploys/larry-site && \
gh pr create --base master --head feat/resend-integration \
  --title "Resend email integration (production rollout)" \
  --body "$(cat <<'EOF'
## Summary
- Replace single hardcoded FROM with a NOREPLY / LARRY env var pair for distinct sender personas on `larry-site.com`.
- Map auth/security emails to `noreply@`; workspace invites, escalations, and referrals to `larry@`.
- Fix referral route's broken FROM (was unalignable Vercel preview hostname).
- Add vitest coverage on FROM mapping for all 6 transactional emails.

Spec: docs/superpowers/specs/2026-04-14-resend-email-integration-design.md
Plan: docs/superpowers/plans/2026-04-14-resend-email-integration.md

## Test plan
- [x] Unit tests pass (`vitest run src/lib/email.test.ts` in apps/api)
- [x] Local integration test sent all 6 email types, all delivered with green SPF/DKIM/DMARC
- [ ] Production smoke test (post-merge)
- [ ] Inbox provider matrix (Gmail / Outlook / corporate)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for CI green**

Run: `gh pr checks` (in repo). Wait until all checks are passing.

- [ ] **Step 3: Confirm with user before merging**

This is a production-affecting change touching the auth flow's email path. Pause and explicitly ask the user: "PR is green and ready. Merge to master and deploy?"

- [ ] **Step 4: Merge**

Run: `cd /c/Dev/larry/site-deploys/larry-site && gh pr merge feat/resend-integration --squash --delete-branch`
Expected: PR merged, branch deleted.

- [ ] **Step 5: Watch deployments**

Vercel: Run `vercel ls` to find the latest deployment. Wait until status = `Ready`.
Railway: Run `railway status` for both api and worker services. Wait until both show `SUCCESS` on the latest deployment.

---

## Task 13: Production smoke test

**Files:** none.

- [ ] **Step 1: Real signup → verification email**

In a private/incognito browser, go to the production frontend. Sign up with a fresh email address (use `+resend-smoke-1@yourdomain.com` style alias).

Expected: signup completes; verification email arrives within 30 seconds; from = `Larry <noreply@larry-site.com>`; clicking the link verifies the address; redirect to dashboard succeeds.

- [ ] **Step 2: Forgot password → reset email**

Sign out. Click "Forgot password" → enter the email from Step 1.

Expected: reset email arrives; from = `noreply@larry-site.com`; clicking the link allows password change; new password works for sign-in.

- [ ] **Step 3: Workspace invite → larry@ email**

Sign in as the original test account. Invite a fresh email to your workspace.

Expected: invite email arrives; from = `Larry <larry@larry-site.com>` (the friendly sender); subject = "You've been invited to Larry."

- [ ] **Step 4: Confirm Resend dashboard shows production sends**

Open https://resend.com/emails. Filter by today.

Expected: 3 new sends visible (verify, reset, invite). All `Delivered`. All with green deliverability indicators. Note the IP and User-Agent — they should be from Railway (api service), not localhost.

- [ ] **Step 5: If any step fails, ROLLBACK**

If the live flow breaks (emails don't arrive, wrong sender, errors in Railway logs):

Quick rollback: in Railway, set `RESEND_API_KEY=` (empty) on the api service. The `isResendConfigured()` guard kicks in — auth flows continue to work, emails just log to console. Then debug.

Full rollback: `gh pr revert <merged-pr-number>` and re-deploy.

---

## Task 14: Inbox provider matrix

**Files:** none. Documentation-only outcome.

- [ ] **Step 1: Send a verification email to a Gmail address**

Repeat Task 13 Step 1 with a Gmail address.
Confirm: arrives in **Inbox** (not Promotions, not Spam).

- [ ] **Step 2: Send a verification email to an Outlook/Hotmail address**

Repeat with `@outlook.com` or `@hotmail.com`.
Confirm: arrives in **Inbox**, not Junk.

- [ ] **Step 3: Send a verification email to a corporate Exchange address (if available)**

If the user has a work address on Microsoft 365 or Google Workspace, repeat there.
Confirm: arrives in **Inbox**.

- [ ] **Step 4: Document results**

Append a short "Inbox matrix" section to the spec doc with date, provider, outcome (inbox / spam / quarantined). Commit:

```bash
cd /c/Dev/larry/site-deploys/larry-site && \
git add docs/superpowers/specs/2026-04-14-resend-email-integration-design.md && \
git commit -m "docs(spec): record inbox matrix results from production smoke test"
```

- [ ] **Step 5: Done**

Update memory: add a note that Larry's transactional email is live on Resend with verified `larry-site.com` domain, dual senders (`noreply@` + `larry@`), and the `isResendConfigured()` kill switch is the rollback path.

---

## Self-Review Checklist (executor — read before starting)

- Each task is committable independently (except 9–10, which are env/branch ops with no commit).
- TDD discipline enforced in Tasks 3+4: tests fail first, then code, then tests pass.
- Type-checks before commits in Tasks 2, 5, 6.
- Rollback path explicit in Task 13.
- No placeholders: every code change shows the exact before/after content.
- Domain: `larry-site.com`. Senders: `noreply@` and `larry@`. Env vars: `RESEND_API_KEY`, `RESEND_FROM_NOREPLY`, `RESEND_FROM_LARRY` (these names are stable across all tasks).
