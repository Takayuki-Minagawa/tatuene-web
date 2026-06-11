/**
 * 図面枠内の画像変換に関する純粋幾何計算。
 * DrawingEditor の imgTransform（rotate→scale、中心基準）と同じ座標系で計算する。
 * DOM に依存しないため jsdom 上でユニットテスト可能。
 */
import type { ImageTransform } from "./store";

export interface Pt {
  x: number;
  y: number;
}

export interface FitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 10;

/** 画像を箱に contain フィットしたときの寸法と左上座標 */
export function fitContain(natW: number, natH: number, boxW: number, boxH: number): FitRect {
  if (!natW || !natH) return { w: boxW, h: boxH, x: 0, y: 0 };
  const s = Math.min(boxW / natW, boxH / natH);
  const w = natW * s,
    h = natH * s;
  return { w, h, x: (boxW - w) / 2, y: (boxH - h) / 2 };
}

/** 変換の基準となる画像中心（フィット矩形中心 + 平行移動） */
export function imageCenter(fit: FitRect, t: ImageTransform): Pt {
  return { x: fit.x + t.x + fit.w / 2, y: fit.y + t.y + fit.h / 2 };
}

/** 回転・拡縮適用後の画像4隅（フレームローカル座標） */
export function imageCorners(
  fit: FitRect,
  t: ImageTransform
): { tl: Pt; tr: Pt; br: Pt; bl: Pt; center: Pt } {
  const center = imageCenter(fit, t);
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  const map = (px: number, py: number): Pt => {
    // 中心基準で scale → rotate（SVG の rotate(...) translate scale translate と等価）
    const dx = (px - center.x) * t.scale;
    const dy = (py - center.y) * t.scale;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  };
  const left = fit.x + t.x,
    top = fit.y + t.y;
  return {
    tl: map(left, top),
    tr: map(left + fit.w, top),
    br: map(left + fit.w, top + fit.h),
    bl: map(left, top + fit.h),
    center,
  };
}

/**
 * フレーム座標 → 画像ローカル座標（変換前の contain フィット矩形と同じ空間）。
 * imgTransform（flip → scale → rotate、中心基準）の逆変換。crop ハンドルのドラッグ変換用。
 */
export function frameToImageLocal(p: Pt, fit: FitRect, t: ImageTransform): Pt {
  const center = imageCenter(fit, t);
  const rad = (-t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  const dx = p.x - center.x,
    dy = p.y - center.y;
  let rx = (dx * cos - dy * sin) / t.scale;
  let ry = (dx * sin + dy * cos) / t.scale;
  if (t.flipH) rx = -rx;
  if (t.flipV) ry = -ry;
  return { x: center.x + rx, y: center.y + ry };
}

/** 画像ローカル座標 → フレーム座標（frameToImageLocal の逆） */
export function imageLocalToFrame(p: Pt, fit: FitRect, t: ImageTransform): Pt {
  const center = imageCenter(fit, t);
  let dx = p.x - center.x,
    dy = p.y - center.y;
  if (t.flipH) dx = -dx;
  if (t.flipV) dy = -dy;
  dx *= t.scale;
  dy *= t.scale;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
export const MIN_CROP = 0.05;

/** crop 割合（フィット矩形基準）を画像ローカル座標の矩形へ変換 */
export function cropToLocalRect(crop: CropRect, fit: FitRect, t: ImageTransform): FitRect {
  const left = fit.x + t.x,
    top = fit.y + t.y;
  return {
    x: left + crop.x * fit.w,
    y: top + crop.y * fit.h,
    w: crop.w * fit.w,
    h: crop.h * fit.h,
  };
}

/**
 * crop の1隅をドラッグしたときの新しい crop 割合。
 * 対角の隅を固定し、最小サイズ MIN_CROP・範囲 0..1 にクランプする。
 */
export function cropFromHandleDrag(
  crop: CropRect,
  handle: "tl" | "tr" | "br" | "bl",
  localPt: Pt,
  fit: FitRect,
  t: ImageTransform
): CropRect {
  const fx = Math.min(1, Math.max(0, (localPt.x - (fit.x + t.x)) / fit.w));
  const fy = Math.min(1, Math.max(0, (localPt.y - (fit.y + t.y)) / fit.h));
  let x1 = crop.x,
    y1 = crop.y,
    x2 = crop.x + crop.w,
    y2 = crop.y + crop.h;
  if (handle === "tl" || handle === "bl") x1 = Math.min(fx, x2 - MIN_CROP);
  else x2 = Math.max(fx, x1 + MIN_CROP);
  if (handle === "tl" || handle === "tr") y1 = Math.min(fy, y2 - MIN_CROP);
  else y2 = Math.max(fy, y1 + MIN_CROP);
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(1, x2);
  y2 = Math.min(1, y2);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** コーナーハンドルのドラッグから新しい scale を求める（中心からの距離比） */
export function scaleFromHandleDrag(center: Pt, startPt: Pt, curPt: Pt, startScale: number): number {
  const d0 = Math.hypot(startPt.x - center.x, startPt.y - center.y);
  const d1 = Math.hypot(curPt.x - center.x, curPt.y - center.y);
  if (d0 < 1e-6) return startScale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale * (d1 / d0)));
}

/** -180〜180 に正規化 */
export function normalizeAngle(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

/**
 * 回転ハンドルのドラッグから新しい回転角を求める。
 * snap15=true（Shift押下）で15°刻み。0/±90/180 の±3°以内は常に吸着。
 */
export function rotationFromHandleDrag(
  center: Pt,
  startPt: Pt,
  curPt: Pt,
  startRotation: number,
  snap15 = false
): number {
  const a0 = Math.atan2(startPt.y - center.y, startPt.x - center.x);
  const a1 = Math.atan2(curPt.y - center.y, curPt.x - center.x);
  let deg = normalizeAngle(startRotation + ((a1 - a0) * 180) / Math.PI);
  if (snap15) deg = normalizeAngle(Math.round(deg / 15) * 15);
  for (const target of [0, 90, -90, 180, -180]) {
    if (Math.abs(deg - target) <= 3) return normalizeAngle(target);
  }
  return deg;
}
