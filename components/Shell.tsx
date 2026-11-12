import type { ReactNode } from "react";

interface ShellProps {
  worker?: boolean;
  lang?: string;
  demo?: boolean;
  role?: string;
  children: ReactNode;
}

export default function Shell({ worker: workerProp, lang: langProp, demo, role, children }: ShellProps) {
  const worker = workerProp ?? false;
  const lang = langProp ?? "ko";
  const width = worker ? "max-w-[560px]" : "max-w-[1320px]";
  return (
    <div lang={lang} className="min-h-dvh">
      <header>
        <div className={"mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 " + width}>
          <a className="flex items-center gap-2.5 text-ink no-underline" href={worker ? undefined : "/"}>
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-ink">
              <span className="block size-3 rounded-full bg-except" />
            </span>
            <span className="text-xl font-black tracking-[-0.06em]">{worker ? "Fieldnote" : "현장노트"}</span>
            {!worker && <span className="hidden text-sm font-semibold text-ink-2 sm:inline">읽음에서 이해로</span>}
          </a>
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            {demo && <span className="tag bg-except">로컬 데모</span>}
            {role ?? (worker ? "" : "관리자")}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
