/** 保存ファイル名に使えない文字を "_" に置換する（ZIP/PDF 書き出し共通）。 */
export function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_");
}
