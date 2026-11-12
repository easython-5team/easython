import { notFound } from "next/navigation";
import { getWorkflow } from "../../../../lib/store.ts";
import QuizReview from "../../../../components/QuizReview";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = getWorkflow(id);
  if (!workflow) notFound();
  return <QuizReview workflow={workflow} />;
}
