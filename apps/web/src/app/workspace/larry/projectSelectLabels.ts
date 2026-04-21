// B-011: helper for the Fresh conversation / project selector.
// Extracted from page.tsx so the dedupe logic is unit-testable.
//
// Rules:
//   - Unique project names render as-is
//   - Duplicate names get a ` · <suffix>` tag
//   - Prefer the updatedAt date (YYYY-MM-DD) as the suffix
//   - If the (name, date) pair STILL collides — seeded test data often
//     shares both — escalate to `<date> · <shortId>` (or just shortId when
//     updatedAt is missing) so every duplicate gets a visually distinct
//     label

export type LabelledProject = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

export function buildProjectSelectLabels<T extends LabelledProject>(
  projects: ReadonlyArray<T>,
): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const p of projects) {
    const key = (p.name ?? "").trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const dateKey = (p: T) =>
    `${(p.name ?? "").trim().toLowerCase()}::${
      typeof p.updatedAt === "string" && p.updatedAt ? p.updatedAt.slice(0, 10) : ""
    }`;

  const dateCounts = new Map<string, number>();
  for (const p of projects) {
    const key = (p.name ?? "").trim().toLowerCase();
    if ((nameCounts.get(key) ?? 0) > 1) {
      const dk = dateKey(p);
      dateCounts.set(dk, (dateCounts.get(dk) ?? 0) + 1);
    }
  }

  const labels = new Map<string, string>();
  for (const p of projects) {
    const key = (p.name ?? "").trim().toLowerCase();
    if ((nameCounts.get(key) ?? 0) <= 1) {
      labels.set(p.id, p.name);
      continue;
    }
    const datePart =
      typeof p.updatedAt === "string" && p.updatedAt ? p.updatedAt.slice(0, 10) : "";
    const shortId = p.id.slice(0, 6);
    const dk = dateKey(p);
    const needsIdSuffix = !datePart || (dateCounts.get(dk) ?? 0) > 1;
    const suffix = needsIdSuffix
      ? datePart
        ? `${datePart} · ${shortId}`
        : shortId
      : datePart;
    labels.set(p.id, `${p.name} · ${suffix}`);
  }
  return labels;
}
