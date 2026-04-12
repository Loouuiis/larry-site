// QA-2026-04-12 C-2: the Gemini/AI-Studio error ("Your project has exceeded
// its monthly spending cap. Please go to AI Studio at https://ai.studio/spend
// to manage your project spend cap.") leaked verbatim to end users during the
// outage. The raw message still goes to error_stack / error_payload for
// engineering, but error_message is the field the UI renders — it must be
// a neutral, user-safe string.

const PROVIDER_LEAK_PATTERNS: RegExp[] = [
  /spending cap/i,
  /ai\.studio/i,
  /ai studio/i,
  /api key/i,
  /quota|rate[- ]?limit/i,
  /\b(401|403|429|5\d\d)\b/,
  /generativelanguage\.googleapis/i,
  /openai\.com/i,
  /anthropic\.com/i,
];

export function sanitizeErrorMessageForUser(raw: string | null | undefined): string {
  const neutral = "Larry is temporarily unavailable — we'll retry automatically.";
  if (!raw) return neutral;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return neutral;
  const looksLikeProviderLeak = PROVIDER_LEAK_PATTERNS.some((p) => p.test(trimmed));
  if (looksLikeProviderLeak) {
    return `${neutral} If this keeps happening, contact support.`;
  }
  return trimmed.slice(0, 500);
}
