import { notFound } from "next/navigation";
import { getPublicNotice } from "../../../lib/store.ts";
import Shell from "../../../components/Shell";
import WorkerNotice from "../../../components/WorkerNotice";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Work notice · Fieldnote" };
}

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = getPublicNotice(id);
  if (!notice) notFound();
  return (
    <Shell worker>
      <main className="container worker">
        <div className="page-heading"><h1>Work notice</h1><p>Read the update, then describe what you would do.</p></div>
        <section className="panel worker-panel"><WorkerNotice id={id} notice={notice} /></section>
      </main>
    </Shell>
  );
}
