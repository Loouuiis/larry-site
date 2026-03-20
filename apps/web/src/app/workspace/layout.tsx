import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { WorkspaceShell } from "./WorkspaceShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return <WorkspaceShell userEmail={session.email}>{children}</WorkspaceShell>;
}
