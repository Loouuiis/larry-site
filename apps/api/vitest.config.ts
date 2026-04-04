import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      // docx and exceljs are binary-generation libraries not available in the test
      // environment — stub them out so tests importing document-generator.ts don't fail.
      docx: new URL("./tests/__mocks__/docx.ts", import.meta.url).pathname,
      exceljs: new URL("./tests/__mocks__/exceljs.ts", import.meta.url).pathname,
    },
  },
});
