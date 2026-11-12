import "./globals.css";

export const metadata = {
  title: "현장노트 · 작업 변경 공지",
  description: "변경된 작업 지시를 검수하고 작업자의 이해를 확인합니다.",
};

export default function RootLayout({ children }) {
  return <html lang="ko"><body>{children}</body></html>;
}
