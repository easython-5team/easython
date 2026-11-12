import AdminWorkspace from "../features/admin/AdminWorkspace";
import Shell from "../ui/Shell";
import { recentNotices } from "../server/db/store.ts";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Shell>
      <AdminWorkspace recent={recentNotices()} />
    </Shell>
  );
}
