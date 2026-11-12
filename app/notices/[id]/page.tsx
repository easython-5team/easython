import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Dashboard from "../../../features/admin/Dashboard";
import Shell from "../../../ui/Shell";
import { getNotice } from "../../../server/db/store.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이해 확인 현황 · 현장노트" };

export default async function NoticeDashboard({ params }: PageProps<"/notices/[id]">) {
  const { id } = await params;
  if (!getNotice(id)) notFound();
  return (
    <Shell role="관리자 · 이해 확인 현황">
      <Dashboard id={id} baseUrl={process.env.PUBLIC_BASE_URL || ""} />
    </Shell>
  );
}
