import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "현장노트 · 읽음에서 이해로",
  description: "변경된 작업 지시를 작업자의 언어로 전하고, 이해했는지 조건별로 확인합니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#183e36" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
