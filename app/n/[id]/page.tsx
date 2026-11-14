import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Shell from "../../../ui/Shell";
import WorkerApp from "../../../features/worker/WorkerApp";
import { getNotice } from "../../../server/db/store.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Work notice · 현장노트" };

export default async function WorkerPage({ params }: PageProps<"/n/[id]">) {
  const { id } = await params;
  if (!getNotice(id)) notFound();
  return (
    <Shell worker lang="en">
      <main className="mx-auto w-full max-w-[560px] px-4 pt-5 pb-16">
        <WorkerApp id={id} />
      </main>
    </Shell>
  );
}
