import { notFound } from "next/navigation";
import { getJudgmentContext } from "../../../lib/store.js";
import Shell from "../../../components/Shell";
import WorkerNotice from "../../../components/WorkerNotice";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Work notice · Fieldnote" };
}

export default async function WorkerPage({ params }) {
  const { id } = await params;
  const notice = await getJudgmentContext(id);
  if (!notice) notFound();
  return (
    <Shell worker>
      <main className="container worker">
        <div className="page-heading"><h1>Work notice</h1><p>Choose your language to read the notice.</p></div>
        <section className="panel worker-panel"><WorkerNotice id={id} /></section>
      </main>
    </Shell>
  );
}
