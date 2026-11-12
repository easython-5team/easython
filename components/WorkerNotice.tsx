import Notice from "./Notice";
import WorkerAnswer from "./WorkerAnswer";
import type { WorkerPreview } from "../lib/types.ts";

export default function WorkerNotice({ id, notice }: { id: string; notice: WorkerPreview }) {
  return <><Notice notice={notice} /><WorkerAnswer id={id} /></>;
}
