// QA-2026-04-12 polish: meeting_notes rows with `title = NULL` rendered
// as the literal string "Meeting transcript" everywhere on the frontend
// (meetings list, action centre origin label, project task drawer, etc.).
// When a transcript contains an obvious self-title in its first line —
// "Meeting: Q3 Security Audit Response Planning (12 April 2026)" or
// "Subject: Standup notes" — derive that and store it on the row so the
// UI shows something specific.

const MAX_TITLE_LENGTH = 120;

// Patterns to recognise a leading title line. Match in order; first hit
// wins. The captured group is the human-readable label.
const TITLE_PATTERNS: RegExp[] = [
  /^\s*meeting[:\-]\s*(.+?)\s*$/i,
  /^\s*subject[:\-]\s*(.+?)\s*$/i,
  /^\s*topic[:\-]\s*(.+?)\s*$/i,
  /^\s*re[:\-]\s*(.+?)\s*$/i,
];

function trimTrailingDateClause(label: string): string {
  // Strip a trailing date clause in parentheses e.g. " (12 April 2026)".
  return label.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

/**
 * Derive a human-readable title for a meeting from its transcript text.
 * Returns `null` if no reasonable title can be extracted; callers should
 * fall back to the existing default (`null` in DB → "Meeting transcript"
 * on the frontend).
 *
 * Behaviour:
 *  - Scans the first non-empty line.
 *  - Recognises common headers: "Meeting:", "Subject:", "Topic:", "Re:".
 *  - Falls back to the first non-empty line itself when it's short
 *    enough to look like a title (≤ 120 chars after trimming).
 *  - Returns null if the first line is too long, looks like body prose,
 *    or the transcript is empty.
 */
export function deriveMeetingTitleFromTranscript(transcript: string | null | undefined): string | null {
  if (!transcript || typeof transcript !== "string") return null;

  const firstLine = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return null;

  for (const pattern of TITLE_PATTERNS) {
    const match = firstLine.match(pattern);
    if (match && match[1]) {
      const cleaned = trimTrailingDateClause(match[1]).slice(0, MAX_TITLE_LENGTH).trim();
      if (cleaned.length > 0) return cleaned;
    }
  }

  // No header pattern matched. Use the first line itself only if it
  // looks like a title (short, no terminal punctuation, no leading
  // bullet / dash that signals body prose, no internal sentence break).
  if (firstLine.length > MAX_TITLE_LENGTH) return null;
  if (/^[-*•]/.test(firstLine)) return null;
  if (/[.!?…]$/.test(firstLine)) return null;
  // Internal `. ` followed by a capital signals at least two sentences
  // — that's body prose, not a title.
  if (/[.!?]\s+[A-Z]/.test(firstLine)) return null;

  return firstLine;
}
