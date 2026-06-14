/**
 * 入力シートのフォーム構成（宣言的設定）。
 *
 * Excel原本は ■ 見出しが疎で、解説（注記）もシート単位でまとまっているため、
 * ここでセクションの区切り・順序・既定の開閉・解説の割り当て・参照表領域を与える。
 * 個々の入力セルのラベル/単位は sheet-parser が自動検出するが、検出が弱い箇所は
 * overrides で上書きする。番地（addr）は一切変更しない。
 */
import { SHEETS } from "@/lib/sheets";

export interface ItemOverride {
  addr: string;
  label?: string;
  unit?: string;
  numeric?: boolean;
  /** 項目ごとの解説（任意・後から追記可）。 */
  guidance?: string;
}

export interface SectionConfig {
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** 行範囲（1始まり・含む）にある入力を自動回収する。 */
  rows?: [number, number];
  /** 明示的な入力セル一覧（順序維持）。rows より優先して先に配置。 */
  addrs?: string[];
  /** 数式セルを読み取り専用で表示する。 */
  formulas?: string[];
  /** ラベル/単位などの上書き。 */
  overrides?: ItemOverride[];
  /** rows 自動回収から除外する入力。 */
  excludeAddrs?: string[];
  /** セクション解説（固定文）。 */
  guidance?: string;
  /** セクション解説を1セルから取得（例: C23）。 */
  guidanceCell?: string;
  /** セクション解説を行範囲（1始まり）＋列(0始まり)から取得。 */
  guidanceRows?: [number, number];
  guidanceCol?: number;
  /** 参照表として描画する領域（0始まり・含む）。fields ではなく表で表示。 */
  reftable?: { fromRow: number; toRow: number; fromCol: number; toCol: number };
  /** 図面スロットID。指定するとセル表ではなく図面エディタ（評価シートと同じ
      挿入・注釈・編集）を表示する。reftable はカバレッジ抑止（作図セルをフォーム
      項目に出さない）に流用する。 */
  drawingSlotId?: string;
}

export interface SheetLayout {
  sections: SectionConfig[];
}

export const SHEET_LAYOUTS: Record<string, SheetLayout> = {
  [SHEETS.cover]: {
    sections: [
      {
        id: "about",
        title: "このシミュレーターについて",
        defaultOpen: false,
        guidanceCell: "C23",
      },
      {
        id: "project",
        title: "物件情報",
        defaultOpen: true,
        addrs: ["E30", "I30", "E34", "E38", "H38", "E42", "E46"],
        formulas: ["H42"],
        overrides: [
          { addr: "E30", label: "工事名" },
          { addr: "I30", label: "工事種別" },
          { addr: "E34", label: "住所" },
          { addr: "E38", label: "場所", unit: "" },
          { addr: "H38", label: "階・室", unit: "" },
          { addr: "E42", label: "建築年", guidance: "「令和7」「平成20」など元号＋年で入力すると、右に西暦が自動表示されます。" },
          { addr: "H42", label: "建築年（西暦）" },
          { addr: "E46", label: "作成日" },
        ],
      },
      {
        id: "diagnostician",
        title: "診断者",
        defaultOpen: true,
        addrs: ["E49", "I49"],
        overrides: [
          { addr: "E49", label: "所属" },
          { addr: "I49", label: "氏名" },
        ],
        // 診断者所属の下の未使用セル（50〜53行）はフォームに出さない。
        excludeAddrs: [
          "E50", "F50", "G50", "I50", "J50", "K50",
          "E51", "F51", "G51", "I51", "J51", "K51",
          "E52", "F52", "G52", "I52", "J52", "K52",
          "E53", "F53", "G53", "I53", "J53", "K53",
        ],
      },
    ],
  },

  [SHEETS.materials]: {
    sections: [
      {
        id: "materials-note",
        title: "入力について",
        defaultOpen: false,
        // ◇部材性能シートの入力について（B2〜B8）
        guidanceRows: [2, 8],
        guidanceCol: 1,
      },
      {
        id: "materials-table",
        title: "断熱材の性能（建材データ）",
        defaultOpen: true,
        guidance:
          "建材の性能データです。性能値は「A：熱伝導率＋厚み」または「B：熱貫流率(U)」のどちらかで入力します（両方入れた場合はBが優先）。計算シートには熱抵抗値(R)が反映されます。変更後は計算シートの建材を選び直してください。",
        // 見出し（10〜11行）＋データ（12〜170行）、列 B〜G を表で表示。
        reftable: { fromRow: 9, toRow: 169, fromCol: 1, toCol: 6 },
      },
    ],
  },

  [SHEETS.currentCalc]: { sections: calcSections("現状") },
  [SHEETS.retrofitCalc]: { sections: calcSections("改修後") },
};

export function getSheetLayout(sheetName: string): SheetLayout | undefined {
  return SHEET_LAYOUTS[sheetName];
}

/**
 * 計算シート（現状／改修後）のセクション構成。
 * 基本データは入力欄（フォーム）で目立たせ、間取り図グリッドと各熱損失計算の
 * ■セクションは横スクロール可能な折りたたみ参照表として 1:1 に保持する。
 * シートで行範囲・最終列が異なるため variant で切り替える。
 */
function calcSections(variant: "現状" | "改修後"): SectionConfig[] {
  if (variant === "現状") {
    const C = 18; // 最終列 index（S列…実データは A〜Q）
    return [
      {
        id: "basic",
        title: "基本データ",
        defaultOpen: true,
        rows: [9, 17],
        guidanceRows: [20, 38],
        guidanceCol: 8, // I列の「◇記入上の注意」
      },
      sec("openings", "開口部（窓・外部ドア・室内ドア）", 18, 40, C, false),
      planSec("plan", "間取り図（現状図）", 41, 65, C, "slot1",
        "間取り図の画像を取り込み（「画像」ボタン／ドラッグ&ドロップ／Ctrl+V）、矢印・丸数字・文字で注釈できます。ここで作図した図はそのまま評価シートの「現状図」に反映されます。"),
      sec("walls", "壁部からの熱損失計算", 66, 123, C, false),
      sec("roof", "屋根からの熱損失計算", 124, 146, C, false),
      sec("ceiling", "天井からの熱損失計算", 147, 168, C, false),
      sec("floor", "床からの熱損失計算", 169, 190, C, false),
      sec("windows", "窓・ドアからの熱損失計算", 191, 229, C, false),
      sec("gaps", "隙間からの熱損失・日射取得率", 230, 287, C, false),
    ];
  }
  const C = 17; // 改修後は A〜R（最終列 index 17）
  return [
    sec("basic", "基本データ・断熱改修面積・開口部", 9, 40, C, true,
      "白いセルに入力します。断熱改修する部位の面積を【断熱改修面積】に記入してください（面積が空欄だと建材を選んでも計算に反映されません）。"),
    planSec("plan", "間取り図・改修部分図（改修図）", 41, 64, C, "slot2",
      "間取り・改修部分の図を取り込み、矢印・丸数字・文字で注釈できます。ここで作図した図はそのまま評価シートの「改修図」に反映されます。"),
    sec("walls", "壁部からの熱損失計算", 65, 156, C, false),
    sec("roof", "屋根からの熱損失計算", 157, 181, C, false),
    sec("ceiling", "天井からの熱損失計算", 182, 205, C, false),
    sec("floor", "床からの熱損失計算", 206, 229, C, false),
    sec("windows", "窓・ドアからの熱損失計算", 230, 272, C, false),
    sec("gaps", "隙間からの熱損失・日射取得率", 273, 331, C, false),
  ];
}

/** 全幅の折りたたみ参照表セクションを作る簡易ヘルパー。 */
function sec(
  id: string,
  title: string,
  fromRow: number,
  toRow: number,
  toCol: number,
  defaultOpen: boolean,
  guidance?: string,
): SectionConfig {
  return {
    id,
    title,
    defaultOpen,
    guidance,
    // reftable は 0始まり・含む。行範囲は 1始まりで受け取り変換。
    reftable: { fromRow: fromRow - 1, toRow: toRow - 1, fromCol: 0, toCol },
  };
}

/** 間取り図セクション（図面エディタ）。reftable 領域は元のセル作図グリッドを
 *  フォーム項目から除外する（カバレッジ抑止）目的で保持する。 */
function planSec(
  id: string,
  title: string,
  fromRow: number,
  toRow: number,
  toCol: number,
  drawingSlotId: string,
  guidance?: string,
): SectionConfig {
  return {
    id,
    title,
    defaultOpen: false,
    guidance,
    drawingSlotId,
    reftable: { fromRow: fromRow - 1, toRow: toRow - 1, fromCol: 0, toCol },
  };
}
