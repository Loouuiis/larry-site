"use client";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import { CategoryDot } from "@/components/workspace/gantt/CategoryDot";

interface TimelinePayload {
  displayText: string;
  reasoning: string;
  createCategories?: Array<{ tempId: string; name: string; colour: string }>;
  moveProjects?: Array<{ projectId: string; toCategoryTempId?: string; toCategoryId?: string }>;
  recolourCategories?: Array<{ categoryId: string; colour: string }>;
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 1,
  margin: 0,
  marginBottom: 8,
  color: "var(--text-muted)",
};

export function TimelineSuggestionPreview({ event }: { event: WorkspaceLarryEvent }) {
  const payload = event.payload as unknown as TimelinePayload;
  const newCats = payload.createCategories ?? [];
  const moves = payload.moveProjects ?? [];
  const recolours = payload.recolourCategories ?? [];

  const movesByCatTemp = new Map<string, number>();
  for (const m of moves) {
    const key = m.toCategoryTempId ?? m.toCategoryId ?? "_unknown";
    movesByCatTemp.set(key, (movesByCatTemp.get(key) ?? 0) + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>{event.reasoning}</p>

      {newCats.length > 0 && (
        <section>
          <h4 style={sectionHeadingStyle}>New categories</h4>
          {newCats.map((c) => (
            <div
              key={c.tempId}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}
            >
              <CategoryDot color={c.colour} tier="category" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {movesByCatTemp.get(c.tempId) ?? 0} projects
              </span>
            </div>
          ))}
        </section>
      )}

      {moves.length > 0 && (
        <section>
          <h4 style={sectionHeadingStyle}>Project moves</h4>
          <p style={{ fontSize: 13, margin: 0 }}>
            {moves.length} {moves.length === 1 ? "project" : "projects"} will be moved.
          </p>
        </section>
      )}

      {recolours.length > 0 && (
        <section>
          <h4 style={sectionHeadingStyle}>Colour changes</h4>
          <p style={{ fontSize: 13, margin: 0 }}>
            {recolours.length}{" "}
            {recolours.length === 1 ? "category" : "categories"} will be recoloured.
          </p>
        </section>
      )}
    </div>
  );
}
