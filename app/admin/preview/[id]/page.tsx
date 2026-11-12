import { notFound, redirect } from "next/navigation";
import { getWorkflow } from "../../../../lib/store.ts";
import PreviewReview from "../../../../components/PreviewReview";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = getWorkflow(id);
  if (!workflow) notFound();
  if (!workflow.preview) redirect(`/admin/quiz/${encodeURIComponent(id)}`);
  return <PreviewReview workflow={workflow} />;
}
