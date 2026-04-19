"use client";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "log", "json", "xml", "html", "htm",
  "js", "ts", "jsx", "tsx", "py", "rb", "java", "go", "rs", "c", "cpp", "h",
  "css", "scss", "sql", "sh", "yaml", "yml", "toml", "ini", "env",
]);

function ext(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

async function extractDocx(file: File): Promise<string> {
  // Dynamic import so mammoth's ~1MB bundle is only loaded when needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = await import("mammoth") as any;
  const buffer = await readAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result.value as string).trim();
}

export interface ExtractedFile {
  name: string;
  text: string;
  truncated: boolean;
}

const MAX_CHARS = 12_000;

export async function extractFileText(file: File): Promise<ExtractedFile> {
  const extension = ext(file);
  let text: string;

  if (extension === "docx") {
    text = await extractDocx(file);
  } else if (TEXT_EXTENSIONS.has(extension)) {
    text = await readAsText(file);
  } else {
    throw new Error(
      `File type ".${extension}" is not supported for reading. Paste the text directly or use .txt, .docx, .md, or .csv.`
    );
  }

  const truncated = text.length > MAX_CHARS;
  return {
    name: file.name,
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    truncated,
  };
}

export function buildFileContextBlock(files: ExtractedFile[]): string {
  if (files.length === 0) return "";
  return (
    files
      .map(
        (f) =>
          `[Attached file: ${f.name}]${f.truncated ? " (truncated to first 12,000 characters)" : ""}\n` +
          "---\n" +
          f.text +
          "\n---"
      )
      .join("\n\n") + "\n\n"
  );
}
