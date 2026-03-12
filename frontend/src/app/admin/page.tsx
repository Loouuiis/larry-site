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
    <div className="min-h-screen bg-neutral-50 px-6 py-12 font-sans">
      <div className="mx-auto max-w-5xl space-y-12">

        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Larry — Admin</h1>
          <p className="mt-1 text-sm text-neutral-500">Submissions overview</p>
        </div>

        {/* ── Waitlist ──────────────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">Waitlist</h2>
            <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              {waitlist.length}
            </span>
          </div>

          {waitlist.length === 0 ? (
            <p className="text-sm text-neutral-400">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">
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
                      className={i % 2 === 0 ? "bg-white" : "bg-neutral-50/60"}
                    >
                      <td className="px-4 py-3 text-neutral-400">{waitlist.length - i}</td>
                      <td className="px-4 py-3 font-medium text-neutral-800">
                        {row.firstName} {row.lastName}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{row.company}</td>
                      <td className="px-4 py-3">
                        <a href={`mailto:${row.email}`} className="text-[#8b5cf6] hover:underline">
                          {row.email}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{row.phone}</td>
                      <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
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
            <h2 className="text-lg font-semibold text-neutral-900">Founder Contact</h2>
            <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              {founders.length}
            </span>
          </div>

          {founders.length === 0 ? (
            <p className="text-sm text-neutral-400">No entries yet.</p>
          ) : (
            <div className="space-y-3">
              {founders.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-neutral-200 bg-white px-5 py-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <a
                      href={`mailto:${row.email}`}
                      className="text-sm font-medium text-[#8b5cf6] hover:underline"
                    >
                      {row.email}
                    </a>
                    <span className="text-xs text-neutral-400 whitespace-nowrap">
                      {fmt(row.createdAt)}
                    </span>
                  </div>
                  {row.message && (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-600 border-t border-neutral-100 pt-3">
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
