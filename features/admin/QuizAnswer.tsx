"use client";
import { useId, useState, type ReactNode } from "react";
import type { Condition, Question } from "../../shared/types.ts";
import Chevron from "../../ui/Chevron";

// A quiz question as one thick button; opening it shows the answer below.
// `question` is the plain text (the whole row toggles) or an editor node
// (only the chevron toggles, so typing does not open and close it).
export default function QuizAnswer({ question, label, answer }: { question: ReactNode; label: string; answer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const chevron = <Chevron className={"size-5 text-ink-2 transition-transform " + (open ? "rotate-90" : "-rotate-90")} />;
  const toggle = { "aria-expanded": open, "aria-controls": panelId, onClick: () => setOpen(o => !o) };
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-[14px] bg-paper shadow-[inset_0_0_0_1px_var(--color-grid)] focus-within:shadow-[inset_0_0_0_1.5px_var(--color-ink)]">
      {typeof question === "string" ? (
        <button type="button" {...toggle} className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left text-[16px] font-medium text-ink hover:bg-canvas">
          <span className="min-w-0">{question}</span>{chevron}
        </button>
      ) : (
        <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-0.5">
          <div className="min-w-0 flex-1">{question}</div>
          <button type="button" {...toggle} aria-label={label} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-canvas">{chevron}</button>
        </div>
      )}
      {open && (
        <div id={panelId} className="mx-2.5 mb-2.5 rounded-[10px] bg-ok-bg px-3.5 py-3 text-[15px] text-ok-fg">{answer}</div>
      )}
    </div>
  );
}

// The expected short answer or the example open answer. Notices saved before
// open questions had an example answer show the items the answer must cover.
export function AnswerText({ question, conditions }: { question: Question; conditions: Condition[] }) {
  if (question.answer) return <p className="whitespace-pre-wrap">{question.answer}</p>;
  const items = question.conditionIds.map(id => conditions.find(c => c.id === id)).filter(c => c !== undefined);
  return <ul className="grid list-disc gap-0.5 pl-4">{items.map(c => <li key={c.id}>{c.label}</li>)}</ul>;
}
