import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { Countdown } from "./Countdown";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <LiquidBackground />

      {/* Subtle logout — top-right corner */}
      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-5">
        <LogoutButton />
      </div>

      {/* Full-screen countdown */}
      <main className="flex min-h-screen items-center justify-center px-4">
        <Countdown />
      </main>
    </>
  );
}
