import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { DashboardActions } from "./DashboardActions";
import { getWorkspaceSnapshot } from "@/lib/pm-api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const workspace = await getWorkspaceSnapshot();

  const projectCount = workspace.projects.length;
  const taskCount = workspace.tasks.length;
  const pendingActionCount = workspace.pendingActions.length;

  return (
    <>
      <LiquidBackground />
      <DashboardActions />
      <main className="min-h-screen px-4 pb-16 pt-24 sm:px-8">
        <section className="mx-auto w-full max-w-6xl">
          <header className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Larry Workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Project Command Center
            </h1>
            <p className="mt-2 text-sm text-neutral-600 sm:text-base">
              Live backend snapshot from projects, tasks, and pending AI actions.
            </p>
          </header>

          {!workspace.connected && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-900">
              <p className="font-medium">Workspace API is not connected.</p>
              <p className="mt-1">{workspace.error ?? "Unknown connection error."}</p>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-neutral-200 bg-white/85 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Projects</p>
              <p className="mt-2 text-3xl font-semibold text-neutral-900">{projectCount}</p>
            </article>
            <article className="rounded-2xl border border-neutral-200 bg-white/85 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Tasks</p>
              <p className="mt-2 text-3xl font-semibold text-neutral-900">{taskCount}</p>
            </article>
            <article className="rounded-2xl border border-neutral-200 bg-white/85 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Pending Actions</p>
              <p className="mt-2 text-3xl font-semibold text-neutral-900">{pendingActionCount}</p>
            </article>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
              <h2 className="text-base font-semibold text-neutral-900">Projects</h2>
              <div className="mt-3 space-y-3">
                {workspace.projects.slice(0, 8).map((project) => (
                  <article key={project.id} className="rounded-xl border border-neutral-200/90 bg-white p-3">
                    <p className="text-sm font-medium text-neutral-900">{project.name}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      Status: <span className="font-medium">{project.status}</span>
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      Risk: <span className="font-medium">{project.riskLevel ?? "unknown"}</span>
                    </p>
                  </article>
                ))}
                {workspace.projects.length === 0 && (
                  <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                    No projects yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
              <h2 className="text-base font-semibold text-neutral-900">Tasks</h2>
              <div className="mt-3 space-y-3">
                {workspace.tasks.slice(0, 10).map((task) => (
                  <article key={task.id} className="rounded-xl border border-neutral-200/90 bg-white p-3">
                    <p className="text-sm font-medium text-neutral-900">{task.title}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {task.status} • {task.priority}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "n/a"}
                    </p>
                  </article>
                ))}
                {workspace.tasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                    No tasks yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
              <h2 className="text-base font-semibold text-neutral-900">Action Center</h2>
              <div className="mt-3 space-y-3">
                {workspace.pendingActions.slice(0, 10).map((action) => (
                  <article key={action.id} className="rounded-xl border border-neutral-200/90 bg-white p-3">
                    <p className="text-xs uppercase tracking-wider text-neutral-500">{action.impact}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-800">{action.reason}</p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Confidence: {typeof action.confidence === "number" ? action.confidence.toFixed(2) : action.confidence}
                    </p>
                  </article>
                ))}
                {workspace.pendingActions.length === 0 && (
                  <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                    No pending approval actions.
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}
