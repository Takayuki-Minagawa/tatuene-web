import type { NextConfig } from "next";

// GitHub Pages のプロジェクトサイトは /<repo>/ 配下で配信されるため、
// ビルド時に base path を注入する（ローカル開発では空文字でルート配信）。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // 完全静的書き出し（サーバー不要・任意のWebホスティングで配信可能）
  output: "export",
  images: { unoptimized: true },
  // 末尾スラッシュで /sub/ 配信時の相対パス解決を安定化
  trailingSlash: true,
  // サブパス配信（例: https://<user>.github.io/tatuene-web/）に対応
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
