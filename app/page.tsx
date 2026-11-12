import AdminWorkspace from "../components/AdminWorkspace";
import { materialNotice } from "../lib/demo.ts";

export default function Home() {
  return <AdminWorkspace demoSource={process.env.EASYTHON_DEMO === "1" ? materialNotice : ""} />;
}
