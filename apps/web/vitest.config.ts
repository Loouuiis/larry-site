import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx"],
    environment: "node",
    passWithNoTests: true,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    setupFiles: ["src/test-setup.ts"],
  },
});
