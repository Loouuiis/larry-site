import { DocumentViewPage } from "./DocumentViewPage";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  return <DocumentViewPage id={id} isLarry={type === "larry"} />;
}
