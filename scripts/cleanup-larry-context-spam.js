// N-9 one-off cleanup: strip the "[System] Actions dropped ..." feedback-loop
// spam that pre-N-9 scans appended to projects.larry_context on every failed
// structured-output call. The intelligence.ts transform no longer writes
// these lines; this script removes the historical damage.
//
// Safe to re-run (idempotent). Only touches tenants explicitly allow-listed
// via TENANT_ID env var (or --all to sweep every tenant).
//
// Usage:
//   DATABASE_URL=... node scripts/cleanup-larry-context-spam.js --tenant=<uuid>
//   DATABASE_URL=... node scripts/cleanup-larry-context-spam.js --all
//
// The spam pattern is distinctive: any line containing "[System] Actions
// dropped" was machine-generated and never a real observation.

const { Client } = require("pg");

function stripSpamLines(text) {
  if (!text) return text;
  // Split on line breaks; drop any line that contains the spam marker.
  // Also collapse runs of blank lines the removal might leave behind.
  const kept = text
    .split(/\r?\n/)
    .filter((line) => !/\[System\]\s+Actions dropped/i.test(line));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function main() {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const sweepAll = args.includes("--all");
  const tenantId = tenantArg ? tenantArg.split("=")[1] : null;
  if (!tenantId && !sweepAll) {
    console.error("Pass --tenant=<uuid> or --all");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const filter = sweepAll
    ? "larry_context IS NOT NULL AND larry_context LIKE '%[System] Actions dropped%'"
    : "tenant_id = $1 AND larry_context IS NOT NULL AND larry_context LIKE '%[System] Actions dropped%'";
  const params = sweepAll ? [] : [tenantId];

  const rows = await c.query(
    `SELECT id, tenant_id, name, LENGTH(larry_context) AS chars, larry_context
       FROM projects WHERE ${filter}`,
    params
  );

  console.log(`found ${rows.rowCount} project(s) with [System] spam`);
  let cleanedChars = 0;
  for (const row of rows.rows) {
    const before = row.chars;
    const cleaned = stripSpamLines(row.larry_context);
    const after = cleaned.length;
    cleanedChars += before - after;
    console.log(
      `  ${row.name.padEnd(55)}  ${before} -> ${after}  (-${before - after})`
    );
    await c.query(
      `UPDATE projects SET larry_context = $2, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $3`,
      [row.tenant_id, cleaned.length ? cleaned : null, row.id]
    );
  }
  console.log(
    `done — stripped ${cleanedChars} chars of spam across ${rows.rowCount} project(s)`
  );
  await c.end();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
