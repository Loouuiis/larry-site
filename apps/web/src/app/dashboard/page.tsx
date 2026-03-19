import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { WorkspaceDashboard } from "./WorkspaceDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen bg-[#eef1f6] px-3 pb-8 pt-5 sm:px-5">
      <WorkspaceDashboard />
    </main>
  );
}
