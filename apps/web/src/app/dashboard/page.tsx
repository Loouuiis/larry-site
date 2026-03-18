import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { DashboardActions } from "./DashboardActions";
import { WorkspaceDashboard } from "./WorkspaceDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <LiquidBackground />
      <DashboardActions />
      <main className="min-h-screen px-4 pb-16 pt-24 sm:px-8">
        <WorkspaceDashboard />
      </main>
    </>
  );
}
