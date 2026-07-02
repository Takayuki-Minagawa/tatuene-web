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
  /** 入力欄を短く表示する（階数など1〜2文字の入力用）。 */
  short?: boolean;
  /** 2カラムセクション内で全幅にする（住所など長文の項目用）。 */
  wide?: boolean;
  /** 項目ごとの解説（任意・後から追記可）。 */
  guidance?: string;
}

export interface SectionConfig {
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** 短い項目を2カラムで並べる（スクロール量の削減）。 */
  twoColumn?: boolean;
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
  /** 参照表として描画する領域（0始まり・含む）。fields ではなく表で表示。
      stickyHeaderRows は領域先頭から固定する見出し行数（縦スクロール時に貼り付く）。 */
  reftable?: {
    fromRow: number;
    toRow: number;
    fromCol: number;
    toCol: number;
    stickyHeaderRows?: number;
  };
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
        twoColumn: true,
        addrs: ["E30", "I30", "E34", "E38", "H38", "E42", "E46"],
        formulas: ["H42"],
        overrides: [
          { addr: "E30", label: "工事名" },
          { addr: "I30", label: "工事種別" },
          { addr: "E34", label: "住所", wide: true },
          {
            addr: "E38",
            label: "場所",
            unit: "階",
            short: true,
            guidance: "1階の場合は「1」を、2階の場合は「2」を、それぞれ入力してください。",
          },
          { addr: "H38", label: "室", unit: "" },
          { addr: "E42", label: "建築年", guidance: "「令和7」「平成20」など元号＋年で入力すると、右に西暦が自動表示されます。" },
          { addr: "H42", label: "建築年（西暦）" },
          { addr: "E46", label: "作成日" },
        ],
      },
      {
        id: "diagnostician",
        title: "診断者",
        defaultOpen: true,
        twoColumn: true,
        addrs: ["E49", "I49"],
        overrides: [
          // unit:"" は右隣の見出し文字（「氏名」等）を単位として誤検出するのを抑止
          { addr: "E49", label: "所属", unit: "" },
          { addr: "I49", label: "氏名", unit: "" },
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
        // 見出し（10〜11行）＋データ（12〜170行）、列 B〜G を表で表示。見出し2行は固定。
        reftable: { fromRow: 9, toRow: 169, fromCol: 1, toCol: 6, stickyHeaderRows: 2 },
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
        twoColumn: true,
        rows: [9, 17],
        guidanceRows: [20, 38],
        guidanceCol: 8, // I列の「◇記入上の注意」
      },
      // 表本体（B〜F列）だけを表示し、右側の◇記入上の注意（H/I列）は「解説▼」へ集約する
      sec("openings", "開口部（窓・外部ドア・室内ドア）", 18, 38, 5, false, undefined, {
        guidanceRows: [20, 38],
        guidanceCol: 8,
        stickyHeaderRows: 2,
      }),
      planSec("plan", "間取り図（現状図）", 41, 65, C, "slot1",
        "間取り図の画像を取り込み（「画像」ボタン／ドラッグ&ドロップ／Ctrl+V）、矢印・丸数字・文字で注釈できます。ここで作図した図はそのまま評価シートの「現状図」に反映されます。"),
      // 壁部：Rt/Ut 等の中間計算（演算子の足場）は表示せず、建材選択をラベル＋
      // ドロップダウンのフォームにし、面積・熱損失を読み取りで併記する。
      matFieldsSec("walls-outer", "壁部 ① 外壁部の建材", 69, 74, {
        open: true,
        guidance: "外壁部の建材を上から順に選びます（最大6種・使わない欄は「無し」のまま）。通気層の有無も選択してください。",
        area: { addr: "D68", label: "外壁部面積", unit: "㎡" },
        results: [{ addr: "L85", label: "外壁部の熱損失", unit: "W" }],
        overrides: [{ addr: "O69", label: "通気層（1=あり／2=無し）", numeric: true }],
      }),
      matFieldsSec("walls-inner", "壁部 ② 内壁部の建材", 89, 91, {
        guidance: "内壁部の建材を上から順に選びます（最大3種）。",
        area: { addr: "D88", label: "内壁部面積", unit: "㎡" },
        results: [{ addr: "L102", label: "内壁部の熱損失", unit: "W" }],
      }),
      matFieldsSec("walls-door", "壁部 ③ 室内ドア部の仕様", 105, 107, {
        guidance: "室内ドアの仕様を上から順に選びます（最大3種）。",
        area: { addr: "D104", label: "室内ドア部面積", unit: "㎡" },
        results: [{ addr: "L118", label: "室内ドア部の熱損失", unit: "W" }],
      }),
      resultSec("walls-total", "壁部 熱損失合計",
        [{ addr: "F121", label: "内・外壁の熱損失合計", unit: "W" }]),
      // 屋根・天井・床：単一ブロック。
      matFieldsSec("roof", "屋根の建材", 127, 130, {
        guidance: "屋根部の建材を上から順に選びます（最大4種）。",
        area: { addr: "D126", label: "屋根部面積", unit: "㎡" },
        results: [{ addr: "F144", label: "屋根の熱損失合計", unit: "W" }],
      }),
      matFieldsSec("ceiling", "天井の建材", 150, 152, {
        guidance: "天井部の建材を上から順に選びます（最大3種）。",
        area: { addr: "D149", label: "天井部面積", unit: "㎡" },
        results: [{ addr: "F166", label: "天井の熱損失合計", unit: "W" }],
      }),
      matFieldsSec("floor", "床の建材", 172, 174, {
        guidance: "床部の建材を上から順に選びます（最大3種）。",
        area: { addr: "D171", label: "床部面積", unit: "㎡" },
        results: [{ addr: "F188", label: "床の熱損失合計", unit: "W" }],
      }),
      // 窓・ドア：窓部とドア部の2ブロック。
      matFieldsSec("win-window", "窓・ドア ① 窓の仕様", 194, 196, {
        guidance: "ガラス仕様・その他断熱を選びます。",
        area: { addr: "D193", label: "窓部面積", unit: "㎡" },
        results: [{ addr: "L207", label: "窓の熱損失", unit: "W" }],
      }),
      matFieldsSec("win-door", "窓・ドア ② ドアの仕様", 211, 213, {
        guidance: "ドアの仕様を上から順に選びます（最大3種）。",
        area: { addr: "D210", label: "ドア部面積", unit: "㎡" },
        results: [{ addr: "L224", label: "ドア部の熱損失", unit: "W" }],
      }),
      resultSec("win-total", "窓・ドア 熱損失合計",
        [{ addr: "F227", label: "窓・ドアの熱損失合計", unit: "W" }]),
      // 隙間（換気）＋総熱損失量。日射取得率は入力が無いため参考表として畳む。
      tableResultSec("gaps", "隙間からの熱損失（換気回数）", 232, 239, 1, 17,
        [{ addr: "F240", label: "隙間の熱損失合計", unit: "W" }],
        { guidance: "換気回数を入力します。右の「気密性能の目安」を参考に、築年代に応じた値を選んでください。" }),
      resultSec("total-loss", "総熱損失量【現状】",
        [{ addr: "E246", label: "総熱損失量", unit: "W" }]),
      sec("daylight", "日射取得率（参考）", 248, 286, C, false),
    ];
  }
  const C = 17; // 改修後は A〜R（最終列 index 17）
  return [
    // 基本データ(9-16)は全て現状シートからの自動計算（読み取り）。横長の表をやめ、
    // ラベル＋値の読み取りフィールドにする。断熱改修面積・開口部スケジュールは表で。
    {
      id: "basic-data",
      title: "基本データ（現状シートから自動計算）",
      defaultOpen: true,
      twoColumn: true,
      formulas: [
        "D10", "I10",
        "D11", "I11", "N11",
        "D12", "I12", "N12",
        "D13", "I13", "N13",
        "D14", "I14", "N14",
        "D15", "I15", "N15",
        "D16", "I16",
      ],
    },
    sec("schedule", "断熱改修面積・開口部", 18, 40, C, true,
      "白いセルに入力します。断熱改修する部位の面積を【断熱改修面積】に記入してください（面積が空欄だと建材を選んでも計算に反映されません）。",
      { stickyHeaderRows: 2 }),
    planSec("plan", "間取り図・改修部分図（改修図）", 41, 64, C, "slot2",
      "間取り・改修部分の図を取り込み、矢印・丸数字・文字で注釈できます。ここで作図した図はそのまま評価シートの「改修図」に反映されます。"),
    // 壁部：外壁部は「既存建材」と「断熱建材」の2ブロック、内壁・室内ドアも分解。
    matFieldsSec("walls-outer1", "壁部 ① 外壁部（断熱建材）", 69, 74, {
      open: true,
      guidance: "外壁部の断熱建材を上から順に選びます（最大6種）。",
      area: { addr: "D67", label: "外壁部面積", unit: "㎡" },
    }),
    matFieldsSec("walls-outer2", "壁部 ② 外壁部（断熱建材）", 86, 91, {
      guidance: "断熱改修で追加する建材を上から順に選びます（最大6種）。",
      results: [{ addr: "F109", label: "外壁部の熱損失合計", unit: "W" }],
    }),
    matFieldsSec("walls-inner", "壁部 ③ 内壁部の建材", 114, 116, {
      guidance: "内壁部の建材を上から順に選びます（最大3種）。",
      area: { addr: "D113", label: "内壁部面積", unit: "㎡" },
    }),
    matFieldsSec("walls-door", "壁部 ④ 室内ドア部の仕様", 133, 135, {
      guidance: "室内ドアの仕様を上から順に選びます（最大3種）。",
      area: { addr: "D132", label: "室内ドア部面積", unit: "㎡" },
      results: [{ addr: "F151", label: "内壁部・室内ドア部の熱損失合計", unit: "W" }],
    }),
    resultSec("walls-total", "壁部 熱損失合計",
      [{ addr: "F154", label: "内・外壁の熱損失合計", unit: "W" }]),
    matFieldsSec("roof", "屋根の建材", 160, 163, {
      guidance: "屋根部の建材を上から順に選びます（最大4種）。",
      area: { addr: "D159", label: "屋根部面積", unit: "㎡" },
      results: [{ addr: "F179", label: "屋根の熱損失合計", unit: "W" }],
    }),
    matFieldsSec("ceiling", "天井の建材", 185, 187, {
      guidance: "天井部の建材を上から順に選びます（最大3種）。",
      area: { addr: "D184", label: "天井部面積", unit: "㎡" },
      results: [{ addr: "F203", label: "天井の熱損失合計", unit: "W" }],
    }),
    matFieldsSec("floor", "床の建材", 209, 211, {
      guidance: "床部の建材を上から順に選びます（最大3種）。",
      area: { addr: "D208", label: "床部面積", unit: "㎡" },
      results: [{ addr: "F227", label: "床の熱損失合計", unit: "W" }],
    }),
    matFieldsSec("win-window", "窓・ドア ① 窓の仕様", 233, 235, {
      guidance: "ガラス仕様・その他断熱を選びます。",
      area: { addr: "D232", label: "窓部面積", unit: "㎡" },
    }),
    matFieldsSec("win-door", "窓・ドア ② ドアの仕様", 252, 254, {
      guidance: "ドアの仕様を上から順に選びます（最大3種）。",
      area: { addr: "D251", label: "ドア部面積", unit: "㎡" },
      results: [{ addr: "F270", label: "窓・ドアの熱損失合計", unit: "W" }],
    }),
    tableResultSec("gaps", "隙間からの熱損失（換気回数）", 275, 282, 1, 17,
      [{ addr: "F284", label: "隙間の熱損失合計", unit: "W" }],
      { guidance: "換気回数を入力します。右の「気密性能の目安」を参考にしてください。" }),
    resultSec("total-loss", "総熱損失量【改修】",
      [{ addr: "E290", label: "総熱損失量", unit: "W" }]),
    sec("daylight", "日射取得率（参考）", 292, 331, C, false),
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
  opts?: {
    guidanceRows?: [number, number];
    guidanceCol?: number;
    stickyHeaderRows?: number;
  },
): SectionConfig {
  return {
    id,
    title,
    defaultOpen,
    guidance,
    guidanceRows: opts?.guidanceRows,
    guidanceCol: opts?.guidanceCol,
    // reftable は 0始まり・含む。行範囲は 1始まりで受け取り変換。
    reftable: {
      fromRow: fromRow - 1,
      toRow: toRow - 1,
      fromCol: 0,
      toCol,
      stickyHeaderRows: opts?.stickyHeaderRows,
    },
  };
}

interface ResultDef {
  addr: string;
  label: string;
  unit?: string;
}

/**
 * 建材選択を「ラベル＋ドロップダウン」のフォームで表す。
 * 各建材スロットはドロップダウン1つ（D列）。計算に使われない予備ドロップダウン（E/F列）は
 * 除外し、面積・熱損失は読み取りフィールドとして併記する。Rt/Ut 等の中間計算は表示しない。
 * matFrom/matTo は建材ドロップダウン行（1始まり・含む）。
 */
function matFieldsSec(
  id: string,
  title: string,
  matFrom: number,
  matTo: number,
  opts?: {
    open?: boolean;
    guidance?: string;
    area?: ResultDef;
    results?: ResultDef[];
    overrides?: ItemOverride[];
  },
): SectionConfig {
  const formulas: string[] = [];
  // 建材ドロップダウン（D列）の単位自動検出（隣の「Ｒ値」を拾ってしまう）を抑止。
  // ユーザー指定 overrides を先頭に置き、同番地では指定側を優先する。
  const overrides: ItemOverride[] = [...(opts?.overrides ?? [])];
  for (let r = matFrom; r <= matTo; r++) {
    if (!overrides.some((o) => o.addr === `D${r}`)) overrides.push({ addr: `D${r}`, unit: "" });
  }
  if (opts?.area) {
    formulas.push(opts.area.addr);
    overrides.push({ addr: opts.area.addr, label: opts.area.label, unit: opts.area.unit });
  }
  for (const r of opts?.results ?? []) {
    formulas.push(r.addr);
    overrides.push({ addr: r.addr, label: r.label, unit: r.unit });
  }
  const excludeAddrs: string[] = [];
  for (let r = matFrom; r <= matTo; r++) excludeAddrs.push(`E${r}`, `F${r}`);
  return {
    id,
    title,
    defaultOpen: opts?.open ?? false,
    guidance: opts?.guidance,
    rows: [matFrom, matTo],
    excludeAddrs,
    formulas,
    overrides,
  };
}

/**
 * 熱損失計算の1ブロックを「建材選択の小さな表 ＋ 結果（熱損失）フィールド」で表す。
 * Rt/Ut などの中間計算（演算子セルが並ぶ足場）は表示せず、入力（建材）と結果だけを前面に。
 * fromRow/toRow は 1始まり・含む、fromCol/toCol は 0始まり・含む。
 */
function tableResultSec(
  id: string,
  title: string,
  fromRow: number,
  toRow: number,
  fromCol: number,
  toCol: number,
  results: ResultDef[],
  opts?: { open?: boolean; guidance?: string },
): SectionConfig {
  return {
    id,
    title,
    defaultOpen: opts?.open ?? false,
    guidance: opts?.guidance,
    reftable: { fromRow: fromRow - 1, toRow: toRow - 1, fromCol, toCol },
    formulas: results.map((r) => r.addr),
    overrides: results.map((r) => ({ addr: r.addr, label: r.label, unit: r.unit })),
  };
}

/** 結果（数式）のみを読み取り表示するセクション（合計など）。 */
function resultSec(id: string, title: string, results: ResultDef[]): SectionConfig {
  return {
    id,
    title,
    defaultOpen: false,
    formulas: results.map((r) => r.addr),
    overrides: results.map((r) => ({ addr: r.addr, label: r.label, unit: r.unit })),
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
