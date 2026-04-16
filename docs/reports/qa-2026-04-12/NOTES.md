Project P1: QA Test — Marketing Campaign  id=62925286-16a0-4af5-ab91-3cd65fd1aca2
Project P2: QA Test — API Migration  id=00c82cbf-6de2-497e-9db5-9aeb3f85a7ee

## CRITICAL: AI Spend Cap Exceeded
Time: 2026-04-12 15:18 UTC (approx)
Transcript processing fails with: "Failed after 3 attempts. Last error: Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap."
- Raw Gemini/AI Studio error leaks to end-user UI (security + UX anti-pattern)
- 3 retry attempts before surfacing failure (retry works)
- P2 (API Migration) transcript: still "Processing" 4m after submit — probably stuck/failing silently
- Test 1.1 bootstrap + Test 1.2 vague bootstrap DID work, meaning quota hit during or after those calls
- Affects: Test 1.4, 1.5, likely Phase 2 (intelligence), Phase 3 (chat)
