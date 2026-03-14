import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { Countdown } from "./Countdown";
import { DashboardActions } from "./DashboardActions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <LiquidBackground />
      <DashboardActions />
      <main className="flex min-h-screen items-center justify-center px-4">
        <Countdown />
      </main>
    </>
  );
}
