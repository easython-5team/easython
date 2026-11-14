import type { ReactNode } from "react";

interface ShellProps {
  worker?: boolean;
  lang?: string;
  children: ReactNode;
}

export default function Shell({ worker: workerProp, lang: langProp, children }: ShellProps) {
  const worker = workerProp ?? false;
  const lang = langProp ?? "ko";
  const width = worker ? "max-w-[560px]" : "max-w-[640px]";
  return (
    <div lang={lang} className="min-h-dvh">
      <header className="border-b border-grid bg-paper">
        <div className={"mx-auto flex h-14 items-center justify-between gap-3 px-4 sm:px-6 " + width}>
          <a className="flex items-center gap-2 text-ink no-underline" href={worker ? undefined : "/"}>
            <img src="/icon.svg" alt="" aria-hidden="true" className="size-6" />
            <span className="text-[17px] font-bold tracking-[-0.03em]">현장노트</span>
          </a>
        </div>
      </header>
      {children}
    </div>
  );
}
