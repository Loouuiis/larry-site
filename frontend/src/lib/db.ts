// Direct Turso HTTP API client — no native modules, works on all platforms.
// Turso exposes a simple REST API at /v2/pipeline that accepts SQL statements.

interface Row { [col: string]: string | number | null }

interface DbClient {
  execute(opts: { sql: string; args: (string | number | null)[] }): Promise<{ rows: Row[] }>;
}

export function getDb(): DbClient {
  const raw = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!raw || !token) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
  }

  const baseUrl = raw.replace(/^libsql:\/\//, "https://");

  return {
    async execute({ sql, args }) {
      const res = await fetch(`${baseUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql, args: args.map(v => v === null ? { type: "null" } : { type: typeof v === "number" ? "integer" : "text", value: String(v) }) } },
            { type: "close" },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Turso HTTP error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const result = data.results?.[0]?.response?.result;
      if (!result) return { rows: [] };

      const cols: string[] = result.cols.map((c: { name: string }) => c.name);
      const rows: Row[] = result.rows.map((row: { type: string; value: string }[]) => {
        const obj: Row = {};
        cols.forEach((col, i) => {
          const cell = row[i];
          obj[col] = cell.type === "null" ? null : cell.type === "integer" ? Number(cell.value) : cell.value;
        });
        return obj;
      });

      return { rows };
    },
  };
}
