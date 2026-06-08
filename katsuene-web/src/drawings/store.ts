"use client";
/**
 * 図面（現状図/改修図/図3）の状態ストア。
 * Excelセルではないため計算エンジンとは独立。useSyncExternalStore で購読。
 *
 * 座標系: 各枠の「scale=1 のピクセル箱」内のローカル座標（左上原点）。
 * 画面表示・PDF帳票とも scale=1 で描画するため、保存値はそのまま再現できる。
 *
 * 画像はレンダリングの確実性のためメモリ上は dataURL で保持し、
 * 保存時はZIP内の個別ファイル(assets/<slotId>.<ext>)へ書き出す（JSONには埋め込まない）。
 */
import { useSyncExternalStore } from "react";

export type Annotation =
  | { id: string; type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { id: string; type: "number"; x: number; y: number; value: number; color: string; size: number }
  | { id: string; type: "text"; x: number; y: number; text: string; color: string; size: number };

export interface ImageTransform {
  x: number; // 平行移動(px, 枠ローカル)
  y: number;
  scale: number; // 拡大縮小(1=原寸フィット)
  rotation: number; // 回転(度)
}

export interface SlotState {
  imageDataUrl?: string; // 表示用(メモリ上)
  imageName?: string; // 元ファイル名
  imageType?: string; // MIME
  natW?: number; // 画像の自然サイズ
  natH?: number;
  transform: ImageTransform;
  annotations: Annotation[];
}

/** 保存JSON用（画像バイナリは含めず、ファイル名のみ参照） */
export interface SlotMeta {
  imageName?: string;
  imageType?: string;
  imageFile?: string; // ZIP内のパス assets/<slotId>.<ext>
  natW?: number;
  natH?: number;
  transform: ImageTransform;
  annotations: Annotation[];
}

const DEFAULT_TRANSFORM: ImageTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

const slots = new Map<string, SlotState>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 図面状態の変更を購読（version を返す）。 */
export function useDrawingsVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export function getSlot(id: string): SlotState {
  let s = slots.get(id);
  if (!s) {
    s = { transform: { ...DEFAULT_TRANSFORM }, annotations: [] };
    slots.set(id, s);
  }
  return s;
}

/** id を採番（衝突しにくい簡易ユニーク。乱数/時刻は使わずカウンタ） */
let _seq = 0;
export function nextId(): string {
  _seq++;
  return `a${_seq}`;
}

export function setImage(
  id: string,
  data: { dataUrl: string; name: string; type: string; natW: number; natH: number }
) {
  const s = getSlot(id);
  s.imageDataUrl = data.dataUrl;
  s.imageName = data.name;
  s.imageType = data.type;
  s.natW = data.natW;
  s.natH = data.natH;
  s.transform = { ...DEFAULT_TRANSFORM };
  emit();
}

export function setTransform(id: string, patch: Partial<ImageTransform>) {
  const s = getSlot(id);
  s.transform = { ...s.transform, ...patch };
  emit();
}

export function addAnnotation(id: string, ann: Annotation) {
  getSlot(id).annotations.push(ann);
  emit();
}

export function updateAnnotation(id: string, annId: string, patch: Partial<Annotation>) {
  const s = getSlot(id);
  const i = s.annotations.findIndex((a) => a.id === annId);
  if (i >= 0) s.annotations[i] = { ...s.annotations[i], ...patch } as Annotation;
  emit();
}

export function removeAnnotation(id: string, annId: string) {
  const s = getSlot(id);
  s.annotations = s.annotations.filter((a) => a.id !== annId);
  emit();
}

/** 次の丸数字の連番（枠内の number 注釈の最大値+1） */
export function nextNumber(id: string): number {
  const nums = getSlot(id).annotations.filter((a) => a.type === "number") as Extract<Annotation, { type: "number" }>[];
  return nums.length ? Math.max(...nums.map((n) => n.value)) + 1 : 1;
}

/** 図面全体を削除（差し替え用）。 */
export function clearSlot(id: string) {
  slots.set(id, { transform: { ...DEFAULT_TRANSFORM }, annotations: [] });
  emit();
}

/** 全枠をクリア（読込・初期化時） */
export function clearAll() {
  slots.clear();
  emit();
}

/** 保存用メタ情報を収集（画像本体は別途ZIPへ）。 */
export function collectMeta(): Record<string, SlotMeta> {
  const out: Record<string, SlotMeta> = {};
  for (const [id, s] of slots.entries()) {
    const hasContent = s.imageDataUrl || s.annotations.length > 0;
    if (!hasContent) continue;
    const ext = s.imageType ? s.imageType.split("/")[1] || "png" : "png";
    out[id] = {
      imageName: s.imageName,
      imageType: s.imageType,
      imageFile: s.imageDataUrl ? `assets/${id}.${ext}` : undefined,
      natW: s.natW,
      natH: s.natH,
      transform: s.transform,
      annotations: s.annotations,
    };
  }
  return out;
}

/** メタ＋画像dataURLマップから状態を復元（読込時）。 */
export function restore(meta: Record<string, SlotMeta>, images: Record<string, string>) {
  slots.clear();
  let maxSeq = 0;
  for (const [id, m] of Object.entries(meta)) {
    const annotations = m.annotations ?? [];
    for (const a of annotations) {
      const mm = /^a(\d+)$/.exec(a.id);
      if (mm) maxSeq = Math.max(maxSeq, Number(mm[1]));
    }
    slots.set(id, {
      imageDataUrl: m.imageFile ? images[m.imageFile] : undefined,
      imageName: m.imageName,
      imageType: m.imageType,
      natW: m.natW,
      natH: m.natH,
      transform: m.transform ?? { ...DEFAULT_TRANSFORM },
      annotations,
    });
  }
  // 復元済み注釈IDと衝突しないよう採番カウンタを進める
  if (maxSeq > _seq) _seq = maxSeq;
  emit();
}

/** 画像を持つ枠の {imageFile: dataURL} を返す（ZIP書き出し用）。 */
export function collectImages(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, s] of slots.entries()) {
    if (!s.imageDataUrl) continue;
    const ext = s.imageType ? s.imageType.split("/")[1] || "png" : "png";
    out[`assets/${id}.${ext}`] = s.imageDataUrl;
  }
  return out;
}
