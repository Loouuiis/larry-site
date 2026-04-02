import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface WaitlistRow {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  createdAt: string;
}

interface FounderContactRow {
  id: number;
  email: string;
  message: string | null;
  createdAt: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function AdminPage() {
  const db = getDb();

  const [waitlistResult, foundersResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM WaitlistEntry ORDER BY createdAt DESC", args: [] }),
    db.execute({ sql: "SELECT * FROM FounderContactEntry ORDER BY createdAt DESC", args: [] }),
  ]);

  const waitlist = waitlistResult.rows as unknown as WaitlistRow[];
  const founders = foundersResult.rows as unknown as FounderContactRow[];

  return (
    <div className="min-h-screen bg-[var(--surface-2)] px-6 py-12 font-sans">
      <div className="mx-auto max-w-5xl space-y-12">

        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Larry — Admin</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Submissions overview</p>
        </div>

        {/* ── Waitlist ──────────────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Waitlist</h2>
            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-2)]">
              {waitlist.length}
            </span>
          </div>

          {waitlist.length === 0 ? (
            <p className="text-sm text-[var(--text-disabled)]">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map((row, i) => (
                    <tr
                      key={row.id}
                      className={i % 2 === 0 ? "bg-white" : "bg-[var(--surface-2)]"}
                    >
                      <td className="px-4 py-3 text-[var(--text-disabled)]">{waitlist.length - i}</td>
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                        {row.firstName} {row.lastName}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{row.company}</td>
                      <td className="px-4 py-3">
                        <a href={`mailto:${row.email}`} className="text-[#8b5cf6] hover:underline">
                          {row.email}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{row.phone}</td>
                      <td className="px-4 py-3 text-[var(--text-disabled)] whitespace-nowrap">
                        {fmt(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Founder Contact ───────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Founder Contact</h2>
            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-2)]">
              {founders.length}
            </span>
          </div>

          {founders.length === 0 ? (
            <p className="text-sm text-[var(--text-disabled)]">No entries yet.</p>
          ) : (
            <div className="space-y-3">
              {founders.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-[var(--border)] bg-white px-5 py-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <a
                      href={`mailto:${row.email}`}
                      className="text-sm font-medium text-[#8b5cf6] hover:underline"
                    >
                      {row.email}
                    </a>
                    <span className="text-xs text-[var(--text-disabled)] whitespace-nowrap">
                      {fmt(row.createdAt)}
                    </span>
                  </div>
                  {row.message && (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-2)] border-t border-[var(--border)] pt-3">
                      {row.message}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
