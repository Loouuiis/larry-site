import { RecordProjectVisit } from "./RecordProjectVisit";
import { ProjectPageClient } from "./ProjectPageClient";

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
      <ProjectPageClient projectId={projectId} />
    </>
  );
}
