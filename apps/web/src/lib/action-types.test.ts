import { describe, it, expect } from "vitest";
import { getActionTypeTag } from "./action-types";

describe("action-types map", () => {
  it("returns tags for timeline actions", () => {
    expect(getActionTypeTag("timeline_regroup").label).toBe("Reorganise Timeline");
    expect(getActionTypeTag("timeline_categorise").label).toBe("New Category");
    expect(getActionTypeTag("timeline_recolour").label).toBe("Category Colour");
  });

  it("falls back to other for unknown types", () => {
    expect(getActionTypeTag("nope").label).toBe("Other");
  });
});
