import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "かつエネ断熱シミュレーター Web版",
  description:
    "木造住宅ひと部屋断熱改修の効果を簡易に判定する、かつエネ断熱シミュレーターのWeb版（辰の達人診断）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
