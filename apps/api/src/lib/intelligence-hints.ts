/**
 * Builds the "already pending" clause appended to intelligence hints so the
 * LLM doesn't re-suggest actions that are already waiting for approval.
 */
export function buildPendingClause(pendingTexts: string[]): string {
  if (pendingTexts.length === 0) return "";
  return (
    "\n\nALREADY PENDING APPROVAL (do not re-suggest these):\n" +
    pendingTexts.map((t) => `- ${t}`).join("\n")
  );
}
