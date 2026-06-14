/** シート名の定数（特別扱いの文字列直書きを一元化する）。 */
export const SHEETS = {
  cover: "表紙",
  currentCalc: "計算シート（現状）",
  retrofitCalc: "計算シート（改修後）",
  evaluation: "評価シート", // 帳票（PDF本体）。図面枠あり・忠実描画。
  materials: "部材性能シート", // 建材マスタ
} as const;
