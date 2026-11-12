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
  return (
    <div lang={lang} className={worker ? "shell shell-worker" : "shell shell-admin"}>
      <header className="topbar">
        <div className="bar-inner">
          <a className="brand" href={worker ? undefined : "/"}>
            <span className="brand-mark" aria-hidden="true" />
            <span>{worker ? "Fieldnote" : "현장노트"}</span>
            {!worker && <span className="brand-tagline">읽음에서 이해로</span>}
          </a>
          <span className="role">
            {demo && <span className="demo-badge">로컬 데모</span>}
            {role ?? (worker ? "" : "관리자")}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
