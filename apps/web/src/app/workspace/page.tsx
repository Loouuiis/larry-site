import { WorkspaceHome } from "./WorkspaceHome";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await getSession();
  return <WorkspaceHome viewerEmail={session?.email ?? null} />;
}
