import type { ReactNode } from "react";

export default function Shell({ worker = false, children }: { worker?: boolean; children: ReactNode }) {
  return (
    <div lang={worker ? "en" : "ko"} className="shell">
      <header className="topbar">
        <div className="bar-inner">
          <div className="brand"><span className="brand-mark" aria-hidden="true" />{worker ? "Fieldnote" : "현장노트"}</div>
          <span className="role">{worker ? "Worker view" : "관리자 작업 공간"}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
