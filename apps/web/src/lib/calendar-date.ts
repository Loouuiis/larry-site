// apps/web/src/lib/calendar-date.ts
// Calendar-cell date helpers.
//
// Task dueDates come from the API as bare YYYY-MM-DD strings (see
// `apps/api/src/routes/v1/tasks.ts` which casts DATE columns to text).
// The calendar grid builds cells with `new Date(year, month, day)` which
// are LOCAL midnights. Using `.toISOString().slice(0, 10)` on a local
// midnight shifts the date backwards by one day in any timezone east of
// UTC (Europe, Asia, Australia). That caused every event to land on the
// wrong cell for non-UTC users. Always key by local components instead.

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Normalise any date value from the API to a local YYYY-MM-DD key.
//
// Bare YYYY-MM-DD strings (what the API currently returns for dueDate) are
// returned as-is — no Date construction, no UTC shift possible.
//
// If the API ever returns a datetime string (e.g. "2026-04-30T00:30:00+09:00"),
// we parse it and key by LOCAL components, NOT toISOString() which is UTC and
// would shift the date backwards by a day for users east of UTC.
export function parseDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    return toLocalDateKey(new Date(value));
  } catch {
    return null;
  }
}
