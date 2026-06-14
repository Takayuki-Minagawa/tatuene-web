/** 図面編集器の共有型・定数 */

export type Tool = "select" | "line" | "arrow" | "number" | "text" | "crop";

export type Corner = "tl" | "tr" | "br" | "bl";

/** 画像選択を表す selected の特殊値（注釈IDは a<number> 形式なので衝突しない） */
export const IMAGE_SELECTION = "__image__";

export const COLORS = ["#d32f2f", "#1565c0", "#000000", "#2e7d32", "#f9a825"];
