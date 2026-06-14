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
};

export function getSheetLayout(sheetName: string): SheetLayout | undefined {
  return SHEET_LAYOUTS[sheetName];
}
