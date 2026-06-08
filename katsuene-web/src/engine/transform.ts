/**
 * Excel数式 → HyperFormula互換への「計算結果を変えない」機械的変換。
 *
 * HyperFormula の制約への対応:
 *   1) 非ASCIIのシート名を未引用で参照するとパースエラー
 *      → シート名をASCIIエイリアス(Sheet1..N)へ置換（Excelのシート名変更と等価＝計算不変）
 *   2) 裸の TRUE / FALSE リテラルが #NAME? になる
 *      → TRUE() / FALSE() 関数形式へ置換（値は同一）
 *
 * いずれも文字列リテラル("...")の内側は変換しない（quote-aware）。
 * 元の数式は workbook-model.json に原文のまま保持され、ここでの変換はエンジン構築時のみ。
 */

export type AliasMap = Map<string, string>;

export function buildAliasMap(sheetOrder: string[]): AliasMap {
  const m = new Map<string, string>();
  sheetOrder.forEach((name, i) => m.set(name, `Sheet${i + 1}`));
  return m;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transformChunk(chunk: string, alias: AliasMap): string {
  // 長い名前から処理（部分一致を防ぐ）。引用形→未引用形の順。
  const names = [...alias.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const a = alias.get(name)!;
    chunk = chunk.replace(new RegExp("'" + escapeRe(name) + "'!", "g"), a + "!");
    chunk = chunk.replace(new RegExp(escapeRe(name) + "!", "g"), a + "!");
  }
  // 裸の TRUE/FALSE（直後に "(" が無いもの）を関数形式へ
  chunk = chunk.replace(/\bFALSE\b(?!\s*\()/g, "FALSE()");
  chunk = chunk.replace(/\bTRUE\b(?!\s*\()/g, "TRUE()");
  return chunk;
}

/** 数式文字列を変換（"..." 内は不変）。 */
export function transformFormula(f: string, alias: AliasMap): string {
  let out = "";
  let i = 0;
  while (i < f.length) {
    if (f[i] === '"') {
      // 文字列リテラルを逐語コピー（"" はエスケープ）
      out += f[i++];
      while (i < f.length) {
        out += f[i];
        if (f[i] === '"') {
          if (f[i + 1] === '"') {
            out += f[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    let j = i;
    while (j < f.length && f[j] !== '"') j++;
    out += transformChunk(f.slice(i, j), alias);
    i = j;
  }
  return out;
}

/** 2D配列のセル内容を変換（数式のみ。値はそのまま）。 */
export function transformData(data: any[][], alias: AliasMap): any[][] {
  return data.map((row) =>
    row.map((cell) =>
      typeof cell === "string" && cell.startsWith("=")
        ? transformFormula(cell, alias)
        : cell
    )
  );
}
