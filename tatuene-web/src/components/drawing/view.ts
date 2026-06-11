/**
 * 画像変換の描画用派生値。DrawingEditor と各レイヤで共有する。
 */
import type { ImageTransform } from "@/drawings/store";
import {
  imageCorners,
  cropToLocalRect,
  FULL_CROP,
  type CropRect,
  type FitRect,
  type Pt,
} from "@/drawings/geometry";

export interface ImageView {
  imgX: number;
  imgY: number;
  /** SVG transform 文字列。適用順（右から）: flip → scale → rotate（いずれも画像中心基準） */
  imgTransform: string;
  corners: { tl: Pt; tr: Pt; br: Pt; bl: Pt; center: Pt };
  crop: CropRect;
  hasCrop: boolean;
  cropRect: FitRect;
  brightness: number;
  opacity: number;
}

export function computeImageView(fit: FitRect, t: ImageTransform): ImageView {
  const imgX = fit.x + t.x;
  const imgY = fit.y + t.y;
  const cx = imgX + fit.w / 2;
  const cy = imgY + fit.h / 2;
  const flipPart =
    t.flipH || t.flipV
      ? ` translate(${cx} ${cy}) scale(${t.flipH ? -1 : 1} ${t.flipV ? -1 : 1}) translate(${-cx} ${-cy})`
      : "";
  const imgTransform = `rotate(${t.rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${t.scale}) translate(${-cx} ${-cy})${flipPart}`;
  const crop = t.crop ?? FULL_CROP;
  return {
    imgX,
    imgY,
    imgTransform,
    corners: imageCorners(fit, t),
    crop,
    hasCrop: !!t.crop,
    cropRect: cropToLocalRect(crop, fit, t),
    brightness: t.brightness ?? 1,
    opacity: t.opacity ?? 1,
  };
}
