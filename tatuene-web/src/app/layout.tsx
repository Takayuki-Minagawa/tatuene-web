import type { Metadata } from "next";
import "./globals.css";
// テスト公開期間中のみの簡易パスワードゲート（取り外し方は PasswordGate.tsx 参照）
import PasswordGate from "@/components/PasswordGate";

export const metadata: Metadata = {
  title: "逹エネ断熱シミュレーター Web版",
  description:
    "木造住宅ひと部屋断熱改修の効果を簡易に判定する、逹エネ断熱シミュレーターのWeb版（辰の達人診断）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <PasswordGate>{children}</PasswordGate>
      </body>
    </html>
  );
}
