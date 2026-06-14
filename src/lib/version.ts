/**
 * アプリのバージョン。リリースごとにここを更新する（単一の管理場所）。
 * 表紙には「Ver.X.X.X」として表示され、保存ファイルにも記録される。
 */
export const APP_VERSION = "1.0.0";

/** 表紙に表示するバージョンラベル。 */
export function coverVersionLabel(): string {
  return `Ver.${APP_VERSION}`;
}
