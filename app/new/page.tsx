import type { Metadata } from "next";
import AdminWorkspace from "../../features/admin/AdminWorkspace";
import Shell from "../../ui/Shell";

export const metadata: Metadata = { title: "새 공지 · 현장노트" };

export default function NewNotice() {
  return (
    <Shell>
      <AdminWorkspace />
    </Shell>
  );
}
