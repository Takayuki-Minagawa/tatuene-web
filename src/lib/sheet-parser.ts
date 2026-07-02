/**
 * 入力シートを「セクション→項目」のフォーム用ビューモデルへ変換する純粋関数。
 *
 * 設計のキモ:
 *  - セル番地（D11 等）は一切変えない。各項目は番地で入力セルに紐づき、描画は
 *    CellInput が engine 経由で読み書きする（保存・検証・計算はそのまま）。
 *  - セクションの区切り・並び・解説文の割り当ては src/lib/sheet-layout.ts の宣言的
 *    設定で与える（Excel原本は ■ 見出しが疎なため、設定で意味づけを補う）。
 *  - 設定の行範囲に入らない入力セルは「その他」セクションに必ず回収し、入力の取り
 *    こぼしを防ぐ（網羅性は sheet-parser.test.ts で担保）。
 *
 * React にもエンジンにも依存しない（単体テスト容易）。
 */
import { computeMerges, colName, isFormulaValue, isNumericFmt } from "@/lib/grid";
import { a1ToRC, type SheetModel } from "@/engine/workbook";
import type { SheetLayout, SectionConfig } from "@/lib/sheet-layout";

export type ItemKind = "input" | "dropdown" | "formula";

export interface FormItem {
  /** 紐づくセル番地（入力セル or 数式表示セル）。 */
  addr: string;
  /** 表示ラベル（近傍の見出し文字 or 設定での上書き）。 */
  label: string;
  kind: ItemKind;
  /** 単位サフィックス（ｍ2・年・℃ 等）。 */
  unit?: string;
  /** 数値入力（モバイルの decimal キーパッド用）。 */
  numeric?: boolean;
  /** 項目ごとの解説（任意・後から追記可）。 */
  guidance?: string;
}

export interface RefTableRegion {
  fromRow: number; // 0始まり・含む
  toRow: number; // 0始まり・含む
  fromCol: number;
  toCol: number;
}

export interface FormSection {
  id: string;
  title: string;
  defaultOpen: boolean;
  /** セクションの解説（自動＝注記由来 or 設定）。 */
  guidance?: string;
  kind: "fields" | "reftable" | "drawing";
  items: FormItem[];
  reftable?: RefTableRegion;
  /** kind==="drawing" のとき、表示する図面スロットID（評価シートと共有）。 */
  drawingSlotId?: string;
}

export interface FormSheet {
  sheet: string;
  sections: FormSection[];
}

const isText = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "" && !v.startsWith("=");

/** 単位らしさ（短い・記号/単位語）。ラベル文字との区別に使う。 */
function looksLikeUnit(s: string): boolean {
  const t = s.trim();
  if (t.length === 0 || t.length > 5) return false;
  if (/^[■【]/.test(t)) return false;
  return /^(ｍ2|ｍ3|m2|m3|㎡|㎥|ｍ|m|年|℃|°C|％|%|円|造|室|階|邸|様邸|kWh|W|時間|日|回)$/.test(t) ||
    t.length <= 3;
}

export function parseSheet(
  sheetName: string,
  model: SheetModel,
  layout: SheetLayout | undefined,
): FormSheet {
  const { covered } = computeMerges(model.merges);
  const data = model.data;
  const inputByAddr = new Map(model.inputs.map((i) => [i.addr, i]));
  const dropdown = new Set(model.dropdownCells ?? []);

  // 描画対象の入力 = マージ被覆されていないアンカー入力のみ（旧グリッドと同じ挙動）。
  const renderableInputs = model.inputs.filter((i) => !covered.has(`${i.row},${i.col}`));
  const assigned = new Set<string>();

  /** 入力の表示ラベル: 同じ行の左へ → 同じ列の上へ、最初の非空・非数式テキスト。 */
  function detectLabel(row: number, col: number): string {
    for (let c = col - 1; c >= 0; c--) {
      const v = data[row]?.[c];
      if (isText(v)) return v.trim();
    }
    for (let r = row - 1; r >= 0; r--) {
      const v = data[r]?.[col];
      if (isText(v)) return v.trim();
    }
    return `${colName(col)}${row + 1}`;
  }

  /** 単位: 同じ行の右へ、最初の「単位らしい」短文字列。 */
  function detectUnit(row: number, col: number): string | undefined {
    for (let c = col + 1; c < model.maxCol; c++) {
      const v = data[row]?.[c];
      if (v === null || v === undefined || v === "") continue;
      if (typeof v === "number") return undefined;
      if (isFormulaValue(v)) return undefined;
      const t = String(v).trim();
      return looksLikeUnit(t) ? t : undefined;
    }
    return undefined;
  }

  function isNumericCell(row: number, col: number): boolean {
    const raw = data[row]?.[col];
    if (typeof raw === "number") return true;
    const sid = model.styles[row]?.[col] ?? -1;
    return isNumericFmt(sid >= 0 ? model.styleTable[sid]?.fmt : undefined);
  }

  function buildItem(addr: string, row: number, col: number, override?: ReturnType<typeof getOverride>): FormItem {
    const kind: ItemKind = dropdown.has(addr) ? "dropdown" : "input";
    return {
      addr,
      kind,
      label: override?.label ?? detectLabel(row, col),
      unit: override?.unit ?? detectUnit(row, col),
      numeric: override?.numeric ?? (kind === "input" && isNumericCell(row, col)),
      guidance: override?.guidance,
    };
  }

  function getOverride(sec: SectionConfig, addr: string) {
    return sec.overrides?.find((o) => o.addr === addr);
  }

  /** 領域内の入力を「割当済み」にする（フォーム項目・その他へ出さない）。 */
  function assignRegionInputs(region: RefTableRegion): void {
    for (const i of renderableInputs) {
      if (
        i.row >= region.fromRow &&
        i.row <= region.toRow &&
        i.col >= region.fromCol &&
        i.col <= region.toCol
      ) {
        assigned.add(i.addr);
      }
    }
  }

  const sections: FormSection[] = [];

  for (const sec of layout?.sections ?? []) {
    // 図面セクション: 表ではなく図面エディタを表示。reftable 領域内の入力（元の
    // セル作図グリッド）は割当済み扱いにし、フォーム項目・その他へ出さない。
    if (sec.drawingSlotId) {
      if (sec.reftable) assignRegionInputs(sec.reftable);
      sections.push({
        id: sec.id,
        title: sec.title,
        defaultOpen: sec.defaultOpen ?? true,
        guidance: resolveGuidance(sec, data),
        kind: "drawing",
        items: [],
        drawingSlotId: sec.drawingSlotId,
      });
      continue;
    }

    if (sec.reftable) {
      // reftable に加えて、表の外に出す結果（数式）を読み取りフィールドとして併置できる。
      // 入力（建材選択）は表で、部位ごとの熱損失などの結果はフィールドで前面に出す。
      const resultItems: FormItem[] = [];
      for (const addr of sec.formulas ?? []) {
        const { row, col } = a1ToRC(addr);
        const ov = getOverride(sec, addr);
        resultItems.push({
          addr,
          kind: "formula",
          label: ov?.label ?? detectLabel(row, col),
          unit: ov?.unit ?? detectUnit(row, col),
          guidance: ov?.guidance,
        });
      }
      sections.push({
        id: sec.id,
        title: sec.title,
        defaultOpen: sec.defaultOpen ?? true,
        guidance: resolveGuidance(sec, data),
        kind: "reftable",
        items: resultItems,
        reftable: sec.reftable,
      });
      // reftable 範囲内の入力は「割当済み」とみなす（その他へ回収しない）。
      assignRegionInputs(sec.reftable);
      continue;
    }

    const items: FormItem[] = [];

    // 1) 明示リスト（順序維持）
    if (sec.addrs) {
      for (const addr of sec.addrs) {
        const { row, col } = a1ToRC(addr);
        if (covered.has(`${row},${col}`)) continue;
        if (inputByAddr.has(addr)) {
          items.push(buildItem(addr, row, col, getOverride(sec, addr)));
          assigned.add(addr);
        }
      }
    }

    // 2) 行範囲の自動回収
    if (sec.rows) {
      const [from, to] = sec.rows;
      const inRange = renderableInputs
        .filter((i) => i.row + 1 >= from && i.row + 1 <= to && !assigned.has(i.addr))
        .filter((i) => !(sec.excludeAddrs ?? []).includes(i.addr))
        .sort((a, b) => (a.row - b.row) || (a.col - b.col));
      for (const i of inRange) {
        items.push(buildItem(i.addr, i.row, i.col, getOverride(sec, i.addr)));
        assigned.add(i.addr);
      }
    }

    // 3) 数式の読み取り専用表示（任意）
    for (const addr of sec.formulas ?? []) {
      const { row, col } = a1ToRC(addr);
      const ov = getOverride(sec, addr);
      items.push({
        addr,
        kind: "formula",
        label: ov?.label ?? detectLabel(row, col),
        unit: ov?.unit ?? detectUnit(row, col),
        guidance: ov?.guidance,
      });
    }

    sections.push({
      id: sec.id,
      title: sec.title,
      defaultOpen: sec.defaultOpen ?? true,
      guidance: resolveGuidance(sec, data),
      kind: "fields",
      items,
    });
  }

  // 4) どのセクションにも入らなかった入力を「その他」へ回収（取りこぼし防止）。
  const excludedAll = new Set<string>();
  for (const sec of layout?.sections ?? [])
    for (const a of sec.excludeAddrs ?? []) excludedAll.add(a);
  const leftovers = renderableInputs.filter(
    (i) => !assigned.has(i.addr) && !excludedAll.has(i.addr),
  );
  if (leftovers.length) {
    sections.push({
      id: "__rest__",
      title: "その他",
      defaultOpen: true,
      kind: "fields",
      items: leftovers
        .sort((a, b) => (a.row - b.row) || (a.col - b.col))
        .map((i) => buildItem(i.addr, i.row, i.col)),
    });
  }

  return { sheet: sheetName, sections };
}

function resolveGuidance(sec: SectionConfig, data: any[][]): string | undefined {
  if (sec.guidance) return sec.guidance;
  if (sec.guidanceCell) {
    const { row, col } = a1ToRC(sec.guidanceCell);
    const v = data[row]?.[col];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (sec.guidanceRows) {
    const [from, to] = sec.guidanceRows;
    const col = sec.guidanceCol ?? 0;
    const lines: string[] = [];
    for (let r = from - 1; r <= to - 1; r++) {
      const v = data[r]?.[col];
      if (typeof v === "string" && v.trim() && !v.startsWith("=")) lines.push(v.trim());
    }
    if (lines.length) return lines.join("\n");
  }
  return undefined;
}
