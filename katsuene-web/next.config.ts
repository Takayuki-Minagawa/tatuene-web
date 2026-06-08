import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 完全静的書き出し（サーバー不要・任意のWebホスティングで配信可能）
  output: "export",
  images: { unoptimized: true },
  // 末尾スラッシュで /sub/ 配信時の相対パス解決を安定化
  trailingSlash: true,
};

export default nextConfig;
