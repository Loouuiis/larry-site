import { WorkspaceDashboard } from "@/app/dashboard/WorkspaceDashboard";
import { RecordProjectVisit } from "./RecordProjectVisit";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <>
      <RecordProjectVisit projectId={projectId} />
      <WorkspaceDashboard projectId={projectId} />
    </>
  );
}
