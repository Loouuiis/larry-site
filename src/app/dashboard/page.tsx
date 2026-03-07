import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

async function getUser(userId: string) {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, email, created_at FROM users WHERE id = ?",
    args: [userId],
  });
  return result.rows[0] ?? null;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getUser(session.userId);
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F7F7F4] px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Dashboard
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Welcome back.
          </h1>
        </div>

        <div
          className="rounded-2xl border border-neutral-200 bg-white p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Your account
          </p>
          <p className="mt-2 text-sm text-neutral-700">
            Signed in as{" "}
            <span className="font-medium text-neutral-900">
              {String(user.email)}
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Member since{" "}
            {new Date(String(user.created_at)).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>

          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          This is a placeholder dashboard — your product will live here.
        </p>
      </div>
    </div>
  );
}
