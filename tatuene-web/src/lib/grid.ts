/**
 * Excel風グリッド描画の純粋ユーティリティ（SheetGrid から抽出）。
 */
import { a1ToRC } from "@/engine/workbook";

/** 0始まりの列番号 → Excel列名（0→A, 26→AA） */
export function colName(c: number): string {
  let s = "";
  c += 1;
  while (c > 0) {
    s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

export const addrOf = (r: number, c: number) => `${colName(c)}${r + 1}`;

/** Excel列幅 → px（概算） */
export function widthPx(w: number | undefined): number {
  if (!w) return 60;
  return Math.round(w * 7 + 5);
}

export interface MergeInfo {
  anchors: Map<string, { rs: number; cs: number }>;
  covered: Set<string>;
}

export function computeMerges(merges: string[]): MergeInfo {
  const anchors = new Map<string, { rs: number; cs: number }>();
  const covered = new Set<string>();
  for (const m of merges) {
    const [a, b] = m.split(":");
    if (!b) continue;
    const p1 = a1ToRC(a);
    const p2 = a1ToRC(b);
    const r1 = Math.min(p1.row, p2.row), r2 = Math.max(p1.row, p2.row);
    const c1 = Math.min(p1.col, p2.col), c2 = Math.max(p1.col, p2.col);
    anchors.set(`${r1},${c1}`, { rs: r2 - r1 + 1, cs: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        if (!(r === r1 && c === c1)) covered.add(`${r},${c}`);
  }
  return { anchors, covered };
}

export type TextAlign = "left" | "center" | "right" | "justify";

/** Excel由来の配置文字列を CSS textAlign に安全に変換する */
export function asTextAlign(v: string | undefined | null, fallback: TextAlign = "left"): TextAlign {
  return v === "left" || v === "center" || v === "right" || v === "justify" ? v : fallback;
}
