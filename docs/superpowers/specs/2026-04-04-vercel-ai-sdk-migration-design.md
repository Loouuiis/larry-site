# Vercel AI SDK Migration — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Replace raw `fetch()` LLM calls in `@larry/ai` with Vercel AI SDK

---

## Context

The Larry Intelligence Plan (6 phases) is fully implemented. The AI package (`packages/ai`) currently makes direct HTTP calls to OpenAI, Anthropic, and Gemini APIs using raw `fetch()`. This results in:

- 3 copy-pasted provider classes in `index.ts` (~800 lines combined)
- 3 duplicate raw callers in `intelligence.ts` (`callOpenAI`, `callAnthropic`, `callGemini`)
- Manual JSON parsing with regex fallback (`text.match(/\{[\s\S]*\}/)`)
- No automatic retries on 429/500
- No structured output enforcement at the protocol level

The Vercel AI SDK (`ai` package) eliminates all of these issues with a unified provider interface and `generateObject()` which enforces Zod schemas natively.

---

## Decision

**Approach A: Vercel AI SDK with `generateObject()`** — selected and approved.

Alternatives considered:
- **B) Official provider SDKs individually** — still requires 3 code paths, no unified interface
- **C) Minimal fix (retry wrapper on fetch)** — doesn't solve maintenance problem

---

## Phase 0: Fix Larry Chat 404

**Problem:** Larry chat returns 404 on the deployed app. The frontend calls `/api/workspace/larry/chat` (Next.js API route) which proxies to `${LARRY_API_BASE_URL}/v1/larry/chat` (Fastify). The code is correct locally — builds clean, route is registered.

**Root cause candidates:**
1. Local master is 4 commits ahead of `origin/master` — unpushed changes
2. Railway API may have a stale build or failed deployment
3. Vercel frontend may be serving a stale build

**Fix steps:**
1. Push all pending commits to `origin/master`
2. Check Railway build logs for API deployment status
3. Check Vercel deployment status for frontend
4. Run database migrations on Railway Postgres if any are pending
5. Smoke test: `POST /v1/larry/chat` directly against Railway API URL to isolate frontend vs backend
6. If backend returns 404: inspect Railway build logs for TypeScript compilation failures
7. Verify both API and frontend are live and responding correctly before proceeding

**Definition of done:** Sending "Hey Larry" in the chat UI returns a real Larry response, not a 404.

---

## Phase 1: Add Dependencies

**File:** `packages/ai/package.json`

Add to `dependencies`:
```json
"ai": "^4",
"@ai-sdk/openai": "^1",
"@ai-sdk/anthropic": "^1",
"@ai-sdk/google": "^1"
```

No packages removed. `zod` stays — `generateObject()` uses it directly.

No changes to any other `package.json` — consumers import from `@larry/ai` which re-exports.

**Definition of done:** `npm install` succeeds from the monorepo root. `npm run api:build` still passes.

---

## Phase 2: Create Provider Factory

**New file:** `packages/ai/src/provider.ts`

Single function `createModel(config: IntelligenceConfig)` that returns a Vercel AI SDK model object based on the provider field in `IntelligenceConfig`.

```
openai  → createOpenAI({ apiKey })( model )
anthropic → createAnthropic({ apiKey })( model )
gemini  → createGoogleGenerativeAI({ apiKey })( model )
```

All downstream code uses the returned model object — no provider-specific branching anywhere else.

**What this replaces:** The provider-switching logic currently duplicated in both `index.ts` (`createLlmProvider()` factory) and `intelligence.ts` (`runIntelligence()` switch block).

**Definition of done:** File exists, exports `createModel()`, TypeScript compiles.

---

## Phase 3: Migrate `intelligence.ts`

**File:** `packages/ai/src/intelligence.ts` (951 lines → ~600 lines)

**Replace:**
- `callOpenAI()` (~35 lines) — deleted
- `callAnthropic()` (~35 lines) — deleted
- `callGemini()` (~35 lines) — deleted
- `parseIntelligenceResponse()` (~25 lines) — deleted

**With:**
Single `generateObject()` call inside `runIntelligence()`:

```
const { object } = await generateObject({
  model: createModel(config),
  schema: IntelligenceResultSchema,
  system: buildSystemPrompt(),
  prompt: buildUserPrompt(snapshot, hint),
  temperature: 0.2,
});
return object;
```

**What stays unchanged:**
- `buildSystemPrompt()` — exact same prompt text (the core of Larry's judgment)
- `buildUserPrompt()` — exact same snapshot formatting
- `IntelligenceResultSchema` — existing Zod schema, now passed directly to SDK
- `mockIntelligence()` — stays for dev fallback when no API key
- `runIntelligence()` function signature — same `(config, snapshot, hint)` → `IntelligenceResult`
- All injection detection logic
- `daysBetween()` helper

**Consumers unaffected:**
- `apps/api/src/routes/v1/larry.ts` — calls `runIntelligence()`, signature unchanged
- `apps/api/src/services/larry-briefing.ts` — calls `runIntelligence()`, signature unchanged
- `apps/worker/src/larry-scan.ts` — calls `runIntelligence()`, signature unchanged
- `apps/worker/src/canonical-event.ts` — calls `runIntelligence()`, signature unchanged

**Definition of done:** `runIntelligence()` with a real API key returns a valid `IntelligenceResult`. Mock mode still works without an API key. All existing tests pass.

---

## Phase 4: Migrate `index.ts`

**File:** `packages/ai/src/index.ts` (~1260 lines → ~500 lines)

**Replace:**
- `OpenAiProvider` class (~280 lines) — deleted
- `AnthropicProvider` class (~280 lines) — deleted
- `GeminiProvider` class (~240 lines) — deleted

**With:**
Single `AiSdkProvider` class (~100 lines) implementing the same `LlmProvider` interface:

| Method | SDK Function | Zod Schema |
|--------|-------------|------------|
| `extractActionsFromTranscript()` | `generateObject()` | `ExtractedActionsSchema` |
| `extractProjectStructure()` | `generateObject()` | `ProjectStructureSchema` |
| `summarizeTranscript()` | `generateObject()` | `SummarySchema` |
| `generateResponse()` | `generateText()` | None (plain text) |
| `classifyTaskCommand()` | `generateObject()` | `TaskCommandResultSchema` |

Each method: build system prompt (same text), call SDK function, return typed result. No manual JSON parsing, no regex extraction, no per-provider branching.

**What stays unchanged:**
- `LlmProvider` interface — same 5 methods, same signatures
- `MockLlmProvider` — stays exactly as-is
- `createLlmProvider()` — same signature, instantiates `AiSdkProvider` instead of per-provider classes
- All injection detection: `detectInjectionAttempt`, `sanitiseUserContent`, `wrapUserContent`, `INJECTION_GUARD_RULES`
- All system prompt text (unchanged)
- Pure utilities: `evaluateActionPolicy`, `computeRiskScore`, `classifyRiskLevel`, `inferActionType`, `resolvePolicyThresholds`
- All Zod schemas: `ExtractedActionsSchema`, `SummarySchema`, `TaskCommandResultSchema`, `ProjectStructureSchema`
- All TypeScript types/interfaces: `TaskItem`, `TaskCommandResult`, `LlmProvider`, `ProjectStructure`, etc.
- All re-exports from `@larry/shared`

**Consumers unaffected:**
- `apps/worker/src/context.ts` — calls `createLlmProvider()`, signature unchanged
- `apps/api/src/routes/v1/larry.ts` — uses `LlmProvider` methods, interface unchanged
- All test files — mock the same interface

**Definition of done:** `createLlmProvider()` with a real API key returns a working provider. All 5 `LlmProvider` methods return correct typed results. Mock mode still works. All existing tests pass.

---

## Phase 5: Verify Deployment

1. Build all packages: `npm run api:build`
2. Run tests locally
3. Push to `origin/master`
4. Verify Railway API deploys successfully (check build logs)
5. Verify Vercel frontend deploys successfully
6. Smoke test on production:
   - Send a chat message to Larry → expect structured response with actions
   - Load workspace → expect login briefing
   - Check action centre → expect events with accept/dismiss

**Definition of done:** Larry chat works end-to-end on the deployed app. No 404, no 500. Actions execute. Briefing generates.

---

## Files Changed

| File | Change Type | Lines Before → After |
|------|------------|---------------------|
| `packages/ai/package.json` | Modified | +4 deps |
| `packages/ai/src/provider.ts` | **New** | ~20 lines |
| `packages/ai/src/intelligence.ts` | Modified | 951 → ~600 |
| `packages/ai/src/index.ts` | Modified | ~1260 → ~500 |

## Files NOT Changed

- `packages/db/*` — executor, snapshot, schema, migrations
- `packages/shared/*` — types, interfaces
- `packages/config/*` — env schemas (MODEL_PROVIDER, API keys stay)
- `apps/api/*` — routes, services, plugins
- `apps/worker/*` — scan, handlers, canonical-event
- `apps/web/*` — frontend, hooks, components

## Public API Surface

**Zero breaking changes.** All exports from `@larry/ai` retain the same names and signatures:
- `runIntelligence(config, snapshot, hint)` → `IntelligenceResult`
- `createLlmProvider(options)` → `LlmProvider`
- `detectInjectionAttempt(text)` → `boolean`
- `sanitiseUserContent(text)` → `{ sanitised, injectionDetected }`
- `evaluateActionPolicy(action, thresholds?)` → `PolicyDecision`
- `computeRiskScore(inputs)` → `number`
- `classifyRiskLevel(score)` → `"low" | "medium" | "high"`
- All types re-exported from `@larry/shared`

## Alignment with Intelligence Plan

The Intelligence Plan's architecture is preserved exactly:
- **Phase 1 (Brain):** `runIntelligence()` keeps the same signature — only internals change
- **Phase 2 (Hands):** `LarryExecutor` in `packages/db` is pure DB code, untouched
- **Phase 3 (Chat):** Route calls `runIntelligence()` the same way
- **Phase 4 (Briefing):** Service calls `runIntelligence()` the same way
- **Phase 5 (Inline Actions):** Frontend unchanged
- **Phase 6 (Worker):** Worker calls `runIntelligence()` the same way

The four triggers (schedule, login, chat, signal) all flow through `runIntelligence()` — by changing only the internals of that function, the entire pipeline migrates automatically.

## Non-Negotiables (from Intelligence Plan, still enforced)

1. Multi-tenant isolation — unchanged (DB layer)
2. Real data only — `generateObject()` enforces schema, no fake fallbacks
3. LLM errors surfaced — SDK throws on API failure, no silent fallback
4. Every action attributed — `triggered_by` field unchanged
5. Plain English always — system prompts unchanged
6. Reversibility — executor unchanged
