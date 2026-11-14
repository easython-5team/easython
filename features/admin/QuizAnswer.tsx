import type { Condition, Question } from "../../shared/types.ts";
import Chevron from "../../ui/Chevron";

// A collapsed "정답" row under a quiz question: the expected short answer, or
// for an open question, the notice items the worker's answer has to cover.
export default function QuizAnswer({ question, conditions }: { question: Question; conditions: Condition[] }) {
  const items = question.conditionIds.map(id => conditions.find(c => c.id === id)).filter(c => c !== undefined);
  return (
    <details className="group">
      <summary className="flex w-fit list-none items-center gap-1 rounded-full py-1 text-[13px] font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <Chevron className="size-4 rotate-180 transition-transform group-open:-rotate-90" />정답 보기
      </summary>
      <div className="mt-1.5 rounded-[10px] bg-ok-bg px-3.5 py-2.5 text-[14px] text-ok-fg">
        {question.type === "short" ? <p>{question.answer}</p> : (
          <ul className="grid list-disc gap-0.5 pl-4">{items.map(c => <li key={c.id}>{c.label}</li>)}</ul>
        )}
      </div>
    </details>
  );
}
