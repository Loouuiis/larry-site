import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("test infra", () => {
  it("renders a React component and finds it by role", () => {
    render(<button>hello</button>);
    expect(screen.getByRole("button", { name: "hello" })).toBeInTheDocument();
  });
});
