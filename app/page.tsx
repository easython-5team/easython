import AdminWorkspace from "../features/admin/AdminWorkspace";
import Shell from "../ui/Shell";
import { recentNotices } from "../server/db/store.ts";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Shell role="관리자 · 변경 지시 발행">
      <AdminWorkspace recent={recentNotices()} />
    </Shell>
  );
}
