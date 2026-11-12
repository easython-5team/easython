import { notFound } from "next/navigation";
import { getWorkflow } from "../../../../lib/store.ts";
import AdminWorkspace from "../../../../components/AdminWorkspace";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = getWorkflow(id);
  if (!workflow) notFound();
  return <AdminWorkspace workflow={workflow} />;
}
