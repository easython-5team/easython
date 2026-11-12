import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "현장노트 · 읽음에서 이해로",
  description: "변경된 작업 지시를 작업자의 언어로 전하고, 이해했는지 조건별로 확인합니다.",
  openGraph: {
    type: "website",
    siteName: "현장노트",
    locale: "ko_KR",
    title: "현장노트 · 읽음에서 이해로",
    description: "변경된 작업 지시를 작업자의 언어로 전하고, 이해했는지 조건별로 확인합니다.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#121212" };

const PRETENDARD = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href={PRETENDARD} />
      </head>
      <body>{children}</body>
    </html>
  );
}
