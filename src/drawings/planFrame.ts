/**
 * 間取り図（現状／改修）の作図キャンバス基準。
 *
 * 計算シートの「間取り図」編集枠と、評価シートに貼り込む「現状図／改修図」は
 * 同一の図面スロット（store の id）を共有し、同じ基準座標(W×H)で描く。
 * 評価シート側はセル枠の大きさに合わせて CSS で一括縮小するだけなので、
 * 画像も注釈も寸分違わぬ「コピー」になる（座標は getScreenCTM 基準で一致）。
 *
 * 基準サイズは A4 縦比（高さ/幅 = 1.4 = SheetOverlays の PORTRAIT_RATIO）に合わせる。
 */
export const PLAN_AUTHOR_W = 500;
export const PLAN_AUTHOR_H = 700;

/** 評価シートで「間取り図のコピー」として読み取り専用表示する図面スロットID。 */
export const PLAN_COPY_SLOT_IDS = new Set<string>(["slot1", "slot2"]);

/** 計算シート名 → 間取り図を載せる評価シートの図面スロットID。 */
export const PLAN_SLOT_BY_SHEET: Record<string, string> = {
  "計算シート（現状）": "slot1", // 現状図
  "計算シート（改修後）": "slot2", // 改修図
};
