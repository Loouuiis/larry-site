// Stub for docx package — not installed in test environment.
// document-generator.ts imports this; tests that need the generator mock it directly.
export const Document = class {};
export const Packer = { toBuffer: async () => Buffer.from("") };
export const Paragraph = class {};
export const Table = class {};
export const TableCell = class {};
export const TableRow = class {};
export const TextRun = class {};
export const WidthType = {};
