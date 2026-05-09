type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const REDACT_KEYS = new Set([
  "authorization",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiAccessToken",
  "apiRefreshToken",
  "secret",
  "apiKey",
]);

function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        REDACT_KEYS.has(key) ? "redacted" : normalize(nested),
      ]),
    );
  }
  return value;
}

export function createLogger(scope: string) {
  function write(level: LogLevel, message: string, fields: LogFields = {}) {
    const record = {
      level,
      scope,
      message,
      time: new Date().toISOString(),
      ...(normalize(fields) as LogFields),
    };
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    info: (message: string, fields?: LogFields) => write("info", message, fields),
    warn: (message: string, fields?: LogFields) => write("warn", message, fields),
    error: (message: string, fields?: LogFields) => write("error", message, fields),
  };
}
