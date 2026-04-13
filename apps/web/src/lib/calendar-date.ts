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
