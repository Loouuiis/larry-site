# Testing Larry from Claude Code

This guide tells future Claude sessions **what testing tools are wired up and how to use them efficiently** so testing is fast, not clumsy. Fergus tests on production — so should you.

---

## Tools Available

| Tool | What it does | When to use |
|---|---|---|
| **Playwright MCP** | Drives a real Chromium browser — navigate, click, fill, screenshot, read console/network | Verifying any UI flow on deployed Larry |
| **Vercel MCP** (`https://mcp.vercel.com`) | Query deployments, logs, envs, build status | Checking if a deploy went out, reading function logs |
| **Vercel CLI** (`vercel`) | `vercel ls`, `vercel inspect`, `vercel logs`, `vercel env pull` | CLI-driven deploy checks. Authed as `loouuiis` |
| **Railway CLI** (`railway`) | `railway logs --service <name> -f`, `railway status` | Backend/worker logs. Authed as `led1299@gmail.com` |
| **Smoke test script** | `API_URL=... bash scripts/demo-smoke-test.sh` | End-to-end API auth → project → ingest → accept → feed |

**If a Playwright MCP tool doesn't appear in your tool list**, the session started before it was registered. Tell Fergus to restart Claude Code.

---

## Credentials

Production test account for Playwright lives in a gitignored file at the repo root:

```
C:\Users\oreil\Documents\larry-site\.env.test
```

Contains `LARRY_URL`, `LARRY_TEST_EMAIL`, `LARRY_TEST_PASSWORD`. **Read this file — do not ask Fergus for the creds.**

For **local** dev (Docker running), use `sarah@larry.local` / `DevPass123!` (see CLAUDE.md Test Accounts).

**Production test user is a dedicated account** — safe to accept/decline/delete tasks on it. Do not use real user accounts.

---

## Efficient Navigation — the Route Map

Larry's deployed frontend is at `https://larry-pm.com`. Don't click around aimlessly; go directly to the route you need.

| Route | Page | Use for |
|---|---|---|
| `/login` | Email + password form | Sign in |
| `/signup` | Create account | New user flow |
| `/workspace` | Home — project list, briefing | Landing after login |
| `/workspace/actions` | **Action Centre** — suggested events, accept/decline | Task acceptance flow (the 422 bug lives here) |
| `/workspace/my-work` | Personal task list | User's own task view |
| `/workspace/larry` | Larry chat | Conversational agent |
| `/workspace/projects/[projectId]` | Per-project view — also has inline accept buttons | Deep task / transcript review |
| `/workspace/calendar` | Calendar integration view | Calendar sync testing |
| `/workspace/meetings` | Meeting transcripts | Transcript ingest testing |
| `/workspace/email-drafts` | AI-generated email drafts | Email connector output |
| `/workspace/chats` | Past conversations | Chat history |
| `/workspace/notifications` | Notification list | Alert/briefing delivery |
| `/workspace/settings/connectors` | Slack/Calendar/Email hookups | Integration testing |
| `/workspace/settings/members` | Team management | RBAC testing |
| `/dashboard` | Admin/overview dashboard | Admin flows |

**Navigate by URL, not by clicking through menus.** Use `browser_navigate` with the full URL — saves 3-5 clicks per test.

---

## Sign-In Flow (exact selectors)

```
1. browser_navigate → https://larry-pm.com/login
2. Fill input[type="email"] (id=email) with LARRY_TEST_EMAIL
3. Fill input[type="password"] (id=password) with LARRY_TEST_PASSWORD
4. Click button[type="submit"] (text: "Log in")
5. Wait for URL to become /workspace
```

The login form has **no data-testid attributes** (none exist anywhere in the app yet — see Caveats). Use `id=email`, `id=password`, and submit button by role+name.

Google SSO button is above the form — don't click it for automated sign-in.

---

## Accept / Decline Task Flow

Lives on `/workspace/actions` (Action Centre) and inline on `/workspace/projects/[projectId]`.

**Button identification:**
- Accept button: `<button>` with text `"Accept"` (turns into `"Accepting..."` while pending). Class includes `text-white` with `background: var(--cta)`.
- Modify button: `"Modify"` (adjacent, outlined, uses `var(--cta)` border)
- Decline: similar — look for role=button with matching text.

**To reproduce the 422 bug** (see memory `larry-422-accept-fix.md`):
1. Log in, navigate to `/workspace/actions`
2. Find a suggested event row
3. Click Accept
4. Capture the POST request to `/api/v1/actions/accept` (or similar) — **specifically check `taskId` in payload vs. DB**
5. If 422, expect error message about missing/hallucinated task id

---

## Reading Production Logs While Testing

Pair browser action + log tail for faster root-cause:

```bash
# Terminal 1: tail Railway backend logs
# NOTE: the project `soothing-contentment` has ONE Railway service, `larry-site`,
# which hosts BOTH the Fastify API (routes in apps/api) AND the BullMQ worker
# (apps/worker). There is no separate `larry-api` / `larry-worker` / `larry-backend`.
railway link --project soothing-contentment --environment production
railway logs --service larry-site -f

# Terminal 2: tail Vercel function logs
vercel logs https://larry-pm.com --follow
```

Then run your Playwright flow. Correlate the failed click with the exact log line.

If using Vercel MCP, call the logs tool directly — no shell needed.

---

## Testing Pyramid — Local First, Production Last

Use the cheapest tool that can answer the question. Don't spin up a browser for a bug a type check would catch.

| Layer | Tool | Cost | Use when |
|---|---|---|---|
| 1. Types | `npx tsc --noEmit -p apps/<app>/tsconfig.json` | seconds | Any code change — run first |
| 2. Unit / integration | `npm run api:test`, `npm run worker:test` (vitest, 36+ existing tests) | ~30s | Changing backend logic, routes, worker handlers |
| 3. API smoke | `API_URL=https://larry-site-production.up.railway.app bash scripts/demo-smoke-test.sh` | ~1 min | Verifying auth + ingest + action pipeline end-to-end |
| 4. UI / deploy-env | Playwright MCP against `larry-pm.com` | ~2-3 min | UI behaviour, session cookies, Vercel-specific issues, final verification |

**Rule: climb the pyramid, don't skip it.** If a vitest assertion can prove the fix, don't open a browser. Playwright is for what the lower layers can't see — real rendering, real auth cookies, real Vercel/Railway runtime.

**Add tests where they're missing.** There are no frontend unit tests yet — a new component with meaningful logic deserves a vitest test file, not just Playwright coverage.

---

## When Something Breaks — Debug Order

**Do not guess from the code.** When any test fails or Fergus reports an error, climb the layers:

1. **Reproduce at the lowest layer possible.**
   - Type error? `tsc --noEmit` shows it.
   - Backend logic bug? Write/run a failing vitest test first.
   - Only reach for Playwright if the bug is UI-specific or deploy-specific.

2. **If it only repros on deployed Larry**, then reach for the prod tools:
   - Reproduce in Playwright — capture console + network + screenshot
   - `vercel logs https://larry-pm.com --follow` (or Vercel MCP)
   - `railway logs --service larry-site -f` (single service hosts both API and worker)
   - To verify the 30-minute scan is alive from a tester seat without shell
     access, hit `GET /v1/admin/scan/last-run` — it returns the timestamp,
     count and last error for the most recent scan attempt.
   - **Correlate timestamps.** Browser error → Vercel log → Railway log should line up. The real root cause is usually in Railway, not the browser.

3. **Cite specific evidence in your fix proposal** — a failing vitest assertion, a `tsc` error, or a log line. If you don't have one of those, you don't have a diagnosis yet.

Local repro is preferred. Production repro is for bugs that only exist on the deployed stack.

---

## Verification Checklist for Any UI Change

Before claiming a frontend change works on production:

1. **Wait for Vercel deploy** — `vercel ls` and confirm new deployment is `● Ready`
2. **Navigate to the affected route** on `larry-pm.com` via Playwright
3. **Sign in** using `.env.test` creds
4. **Exercise the feature** — click through the actual user flow
5. **Screenshot** the result so Fergus sees what you saw
6. **Check the browser console** — any new errors?
7. **Check the network tab** — did the expected API call succeed?
8. **Cross-check Railway logs** — did the backend handle it cleanly?

Skipping any of these = you're guessing, not verifying.

---

## Caveats / Known Pain Points

- **No `data-testid` attributes exist anywhere in the frontend.** Playwright must use visible text, `role`, `id`, `type`, or `aria-label`. When adding new interactive elements, **add `data-testid` attributes** — it makes future testing 10× cheaper.
- **Production test user shares the production DB.** Don't delete projects/workspaces belonging to other users. Stay scoped to the test account's tenant.
- **Railway cold starts.** First API call after idle can take 3-5s. If a test fails on timeout, retry once before declaring a real bug.
- **Vercel deploys are per-commit.** Querying `larry-pm.com` always hits the latest production alias — old deployment URLs (`ailarry-xxxxx.vercel.app`) may serve stale code.
- **Session cookie is `larry_session`.** If auth-related tests misbehave, inspect that cookie — the JWT lives inside it and `apps/web/src/lib/workspace-proxy.ts` handles refresh.

---

## When to Add Test IDs

If you're editing a component that has a button/input a future test will care about (accept, submit, login, create-project, etc.), **add `data-testid`** now:

```tsx
<button data-testid="task-accept" onClick={...}>Accept</button>
```

Naming: `<noun>-<action>` — `task-accept`, `login-submit`, `project-create`, `connector-slack-enable`.

This is cheap to add and pays for itself the first time something breaks.
