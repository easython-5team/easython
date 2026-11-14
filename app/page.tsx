import AdminWorkspace from "../features/admin/AdminWorkspace";
import Shell from "../ui/Shell";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Shell>
      <AdminWorkspace />
    </Shell>
  );
}
