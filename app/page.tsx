import AdminWorkspace from "../components/AdminWorkspace";
import Shell from "../components/Shell";
import { demoNotice } from "../lib/demo.ts";
import { recentNotices } from "../lib/store.ts";

export const dynamic = "force-dynamic";

export default function Home() {
  const demo = process.env.EASYTHON_DEMO === "1";
  return (
    <Shell demo={demo} role="관리자 · 변경 지시 발행">
      <AdminWorkspace demoSource={demo ? demoNotice : ""} recent={recentNotices()} />
    </Shell>
  );
}
