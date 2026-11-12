"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Tailwind background class for the colour dot, e.g. "bg-time". */
  swatch?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
}

// A small listbox styled like the rest of the app, replacing the native <select> popup.
export default function Select<T extends string>({ value, options, onChange, label }: SelectProps<T>) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = options.find(o => o.value === value) ?? options[0];

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function show() {
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); show(); }
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(i => Math.min(options.length - 1, i + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
    else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    else if (event.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className="relative">
      <button type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={id} aria-activedescendant={open ? id + "-" + active : undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKeyDown}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white py-1.5 pr-2.5 pl-3 text-[13px] font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--color-grid)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink)]">
        {current?.swatch && <span aria-hidden="true" className={"size-2.5 rounded-full " + current.swatch} />}
        {current?.label}
        <svg aria-hidden="true" viewBox="0 0 12 12" className={"size-3 text-ink-3 transition-transform " + (open ? "rotate-180" : "")}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id={id} role="listbox" aria-label={label}
          className="absolute top-[calc(100%+6px)] left-0 z-30 grid min-w-36 gap-0.5 rounded-2xl bg-white p-1.5 shadow-float">
          {options.map((option, i) => (
            <li key={option.value} id={id + "-" + i} role="option" aria-selected={option.value === value}
              onMouseEnter={() => setActive(i)} onMouseDown={event => event.preventDefault()} onClick={() => choose(i)}
              className={"flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold "
                + (i === active ? "bg-canvas " : "") + (option.value === value ? "text-ink" : "text-ink-2")}>
              {option.swatch && <span aria-hidden="true" className={"size-2.5 rounded-full " + option.swatch} />}
              <span className="flex-1">{option.label}</span>
              {option.value === value && <span aria-hidden="true" className="text-xs">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
