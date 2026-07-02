/**
 * 逹エネ断熱シミュレーター 計算エンジン（HyperFormula ラッパ）。
 *
 * Excel原本の数式を workbook-model.json から読み込み、計算結果を変えない
 * 機械的変換(transform)のみを適用して HyperFormula を構築する。
 * 数式ロジックは一切再実装しない（契約・東京都評価との同一性担保）。
 */
import { HyperFormula, DetailedCellError } from "hyperformula";
import { buildAliasMap, transformData, type AliasMap } from "./transform";
import modelJson from "@/data/workbook-model.json";

export interface CellStyle {
  h: string; // 水平配置 left/center/right
  v: string; // 垂直配置
  b: boolean; // 太字
  sz: number; // フォントサイズ
  fmt: string; // 表示形式(numFmt)
  wrap: boolean;
  bd: [number, number, number, number]; // 罫線 left,right,top,bottom
  fill: string | null; // 塗りつぶし #RRGGBB
  color: string | null; // 文字色 #RRGGBB
}

export interface SheetModel {
  maxRow: number;
  maxCol: number;
  data: any[][];
  merges: string[];
  colWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  inputs: { addr: string; row: number; col: number; default: any }[];
  dropdownCells: string[];
  styleTable: CellStyle[];
  styles: number[][];
  images?: ImageAnchor[];
  drawingSlots?: DrawingSlot[];
  defaultRowHeight?: number;
}

/** ユーザーが図面をアップロード・注釈する配置枠（Excel原本のEMF枠位置） */
export interface DrawingSlot {
  id: string;
  label: string;
  fromCol: number;
  fromColOff: number;
  fromRow: number;
  fromRowOff: number;
  toCol: number;
  toColOff: number;
  toRow: number;
  toRowOff: number;
}

export interface ImageAnchor {
  file: string;
  fromCol: number;
  fromColOff: number;
  fromRow: number;
  fromRowOff: number;
  toCol: number;
  toColOff: number;
  toRow: number;
  toRowOff: number;
}

export interface WorkbookModelJson {
  source: string;
  sheetOrder: string[];
  sheets: Record<string, SheetModel>;
}

const model = modelJson as unknown as WorkbookModelJson;

// 抽出データ（別運用の extract-workbook.py 生成物）の最小限の形式検証。
// 契約がズレた場合に、UI の不可解な失敗ではなく原因の分かる例外で早期に落とす。
function assertModelShape(m: WorkbookModelJson): void {
  if (!m || !Array.isArray(m.sheetOrder) || typeof m.sheets !== "object" || m.sheets === null) {
    throw new Error("workbook-model.json の形式が不正です（sheetOrder / sheets）。");
  }
  for (const name of m.sheetOrder) {
    const s = m.sheets[name];
    if (!s) throw new Error(`workbook-model.json: シート「${name}」が欠落しています。`);
    if (
      typeof s.maxRow !== "number" ||
      typeof s.maxCol !== "number" ||
      !Array.isArray(s.data) ||
      !Array.isArray(s.inputs)
    ) {
      throw new Error(`workbook-model.json: シート「${name}」の構造が不正です。`);
    }
  }
}
assertModelShape(model);

/** "A1" → {row, col}（0始まり） */
export function a1ToRC(a1: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(a1);
  if (!m) throw new Error("bad A1: " + a1);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

export function isError(v: any): v is DetailedCellError {
  return v instanceof DetailedCellError;
}

/** 入力値が空欄か（null/undefined/空白のみ）。空欄カウント・必須チェック共通。 */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** 入力文字列をHF用の値へ（数値文字列→number、空→null、それ以外→文字列/数式）。 */
export function coerce(value: string | number | null): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const s = String(value).trim();
  if (s === "") return null;
  if (typeof value === "string" && s.startsWith("=")) return s;
  // 全角数字も許容して数値化
  const half = s.replace(/[０-９．－]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0xfee0)
  );
  if (/^-?\d+(\.\d+)?$/.test(half)) return Number(half);
  return s;
}

export class WorkbookEngine {
  readonly model = model;
  readonly alias: AliasMap;
  private hf: HyperFormula;
  private sheetIds = new Map<string, number>();

  constructor() {
    this.alias = buildAliasMap(model.sheetOrder);
    const sheets: Record<string, any[][]> = {};
    for (const name of model.sheetOrder) {
      sheets[this.alias.get(name)!] = transformData(model.sheets[name].data, this.alias);
    }
    this.hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
    for (const name of model.sheetOrder) {
      this.sheetIds.set(name, this.hf.getSheetId(this.alias.get(name)!)!);
    }
    // 抽出時の default は原則セル値と同一。意図的に上書きされた default
    // （例: 改修後シート「断熱工事の概要」= 空欄）だけを起動時に反映する。
    // 全セルへの一括 reset は行わない（coerce の trim 等で原本の値が変わり
    // 得るため、差分のあるセルに限定する）。
    this.hf.batch(() => {
      for (const name of model.sheetOrder) {
        const sm = model.sheets[name];
        for (const inp of sm.inputs) {
          const cur = sm.data[inp.row]?.[inp.col] ?? null;
          if ((inp.default ?? null) !== cur) {
            this.setInput(name, inp.addr, (inp.default ?? null) as string | number | null);
          }
        }
      }
    });
  }

  sheetId(name: string): number {
    const id = this.sheetIds.get(name);
    if (id === undefined) throw new Error("unknown sheet: " + name);
    return id;
  }

  /** 計算済みの生値（number/string/DetailedCellError/null） */
  getValue(sheet: string, a1: string): any {
    const { row, col } = a1ToRC(a1);
    return this.hf.getCellValue({ sheet: this.sheetId(sheet), row, col });
  }

  /** 表示用文字列（numFmtを反映、エラーはコード表示） */
  getDisplay(sheet: string, a1: string): string {
    const v = this.getValue(sheet, a1);
    if (v === null || v === undefined || v === "") return "";
    if (isError(v)) return v.value; // 例: #DIV/0!
    const { row, col } = a1ToRC(a1);
    const sm = model.sheets[sheet];
    const sid = sm.styles[row]?.[col] ?? -1;
    const fmt = sid >= 0 ? sm.styleTable[sid].fmt : "General";
    return formatByNumFmt(v, fmt);
  }

  /** 入力セルへ値を設定（再計算は自動） */
  setInput(sheet: string, a1: string, value: string | number | null): void {
    const { row, col } = a1ToRC(a1);
    this.hf.setCellContents({ sheet: this.sheetId(sheet), row, col }, coerce(value));
  }

  /** 入力セルの現在値（生のまま、表示/編集用） */
  getInputRaw(sheet: string, a1: string): any {
    const { row, col } = a1ToRC(a1);
    const addr = { sheet: this.sheetId(sheet), row, col };
    // 入力欄にユーザーが数式(=...)を入れた場合は評価値ではなく原文を返す。
    // 評価値を返すと保存往復で原文が失われ、再表示も値に化けてしまうため。
    const formula = this.hf.getCellFormula(addr);
    if (formula !== undefined) return formula;
    return this.hf.getCellValue(addr);
  }

  /** 全入力欄の現在値を {"シート!セル": 値} で取得（JSON保存用、空は除外） */
  collectInputs(): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const name of model.sheetOrder) {
      for (const inp of model.sheets[name].inputs) {
        const v = this.getInputRaw(name, inp.addr);
        if (v !== null && v !== undefined && v !== "") {
          out[`${name}!${inp.addr}`] = v as string | number;
        }
      }
    }
    return out;
  }

  /** すべての入力欄を既定値に戻す */
  resetToDefaults(): void {
    // batch でまとめて適用し、再計算を最後の1回に集約（セル毎の全再計算を回避）
    this.hf.batch(() => {
      for (const name of model.sheetOrder) {
        for (const inp of model.sheets[name].inputs) {
          this.setInput(name, inp.addr, (inp.default ?? null) as any);
        }
      }
    });
  }

  /** JSONの inputs を反映（まず全消去→既定→上書き） */
  applyInputs(inputs: Record<string, string | number>): void {
    this.hf.batch(() => {
      for (const name of model.sheetOrder) {
        for (const inp of model.sheets[name].inputs) {
          this.setInput(name, inp.addr, null);
        }
      }
      for (const [key, val] of Object.entries(inputs)) {
        const idx = key.indexOf("!");
        const sheet = key.slice(0, idx);
        const addr = key.slice(idx + 1);
        if (this.sheetIds.has(sheet)) this.setInput(sheet, addr, val);
      }
    });
  }
}

/** numFmt に基づく簡易整形（form/report共通の見た目用） */
export function formatByNumFmt(value: number, fmt: string): string {
  if (typeof value !== "number" || !isFinite(value)) return String(value);
  if (!fmt || fmt === "General") {
    // 余分な桁を落とす（最大6桁）
    const r = Math.round(value * 1e6) / 1e6;
    return String(r);
  }
  const isPercent = fmt.includes("%");
  const v = isPercent ? value * 100 : value;
  // 小数点以下の桁数を fmt から推定
  const dot = fmt.indexOf(".");
  let decimals = 0;
  if (dot >= 0) {
    const after = fmt.slice(dot + 1);
    const m = after.match(/[0#]+/);
    decimals = m ? m[0].length : 0;
  }
  const useThousands = /[#0],[#0]/.test(fmt) || fmt.includes("#,##");
  let s = v.toFixed(decimals);
  if (useThousands) {
    const [int, dec] = s.split(".");
    const signed = int.startsWith("-");
    const digits = signed ? int.slice(1) : int;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    s = (signed ? "-" : "") + grouped + (dec ? "." + dec : "");
  }
  if (isPercent) s += "%";
  return s;
}

// シングルトンの保持は store.ts に一元化した（ここではクラスのみ提供）。
