import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Shell from "../../../components/Shell";
import WorkerApp from "../../../components/WorkerApp";
import { getNotice } from "../../../lib/store.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Work notice · Fieldnote" };

export default async function WorkerPage({ params }: PageProps<"/n/[id]">) {
  const { id } = await params;
  if (!getNotice(id)) notFound();
  return (
    <Shell worker lang="en">
      <main className="worker">
        <WorkerApp id={id} />
      </main>
    </Shell>
  );
}
