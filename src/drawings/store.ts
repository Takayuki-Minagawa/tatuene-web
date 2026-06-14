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
import { clampScale } from "./geometry";

// 取り込み・保存ファイルの画像MIMEは許可リストで検証する（不正な type の流用を防ぐ）。
const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
/** 許可された画像MIMEならそのまま、なければ image/png にフォールバック。 */
export function safeImageMime(t?: string): string {
  return t && ALLOWED_IMAGE_MIME[t] ? t : "image/png";
}
/** MIME から安全な拡張子を得る（未知は png）。 */
export function imageExt(t?: string): string {
  return (t && ALLOWED_IMAGE_MIME[t]) || "png";
}

export type Annotation =
  | { id: string; type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { id: string; type: "number"; x: number; y: number; value: number; color: string; size: number }
  | { id: string; type: "text"; x: number; y: number; text: string; color: string; size: number };

export interface ImageTransform {
  x: number; // 平行移動(px, 枠ローカル)
  y: number;
  scale: number; // 拡大縮小(1=原寸フィット)
  rotation: number; // 回転(度)
  // 以下は後方互換のため全てオプショナル（旧保存ファイルには存在しない）
  flipH?: boolean; // 左右反転
  flipV?: boolean; // 上下反転
  opacity?: number; // 0..1（既定1）
  brightness?: number; // 0.5..2（既定1）
  crop?: { x: number; y: number; w: number; h: number }; // フィット矩形に対する割合（既定=全体）
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

// ---- Undo/Redo 履歴 ----
// スナップショット方式・スロット単位エントリのグローバル単一スタック。
// 連続操作（ドラッグ中の setTransform 等）が1操作=1エントリになるよう、
// ジェスチャ開始時に snapshot() で「保留」し、最初の実変更時に積む。
type HistEntry = { slotId: string; before: SlotState };
const HISTORY_LIMIT = 50;
const undoStack: HistEntry[] = [];
const redoStack: HistEntry[] = [];
let pendingSnapshot: HistEntry | null = null;

function cloneSlot(s: SlotState): SlotState {
  return {
    ...s,
    transform: { ...s.transform, crop: s.transform.crop ? { ...s.transform.crop } : undefined },
    annotations: s.annotations.map((a) => ({ ...a })),
  };
}

/** ジェスチャ開始時に呼ぶ。変更が実際に起きるまで履歴には積まない。 */
export function snapshot(id: string) {
  pendingSnapshot = { slotId: id, before: cloneSlot(getSlot(id)) };
}

function pushEntry(e: HistEntry) {
  undoStack.push(e);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  pendingSnapshot = null;
}

/** 保留中スナップショットを履歴へ確定（連続系ミューテータが変更直前に呼ぶ） */
function commitPending(id: string) {
  if (pendingSnapshot?.slotId === id) pushEntry(pendingSnapshot);
}

/** 離散操作用: 現在状態を直接履歴へ積む */
function pushHistory(id: string) {
  pushEntry({ slotId: id, before: cloneSlot(getSlot(id)) });
}

function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  pendingSnapshot = null;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}
export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function undo() {
  const e = undoStack.pop();
  if (!e) return;
  pendingSnapshot = null;
  redoStack.push({ slotId: e.slotId, before: cloneSlot(getSlot(e.slotId)) });
  slots.set(e.slotId, cloneSlot(e.before));
  emit();
}

export function redo() {
  const e = redoStack.pop();
  if (!e) return;
  pendingSnapshot = null;
  undoStack.push({ slotId: e.slotId, before: cloneSlot(getSlot(e.slotId)) });
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  slots.set(e.slotId, cloneSlot(e.before));
  emit();
}

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
  pushHistory(id);
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
  commitPending(id);
  const s = getSlot(id);
  s.transform = { ...s.transform, ...patch };
  // scale は常に許容範囲に丸める（改竄/旧形式JSON/誤操作での描画破綻を防ぐ）
  if (patch.scale !== undefined) s.transform.scale = clampScale(s.transform.scale);
  emit();
}

export function addAnnotation(id: string, ann: Annotation) {
  pushHistory(id);
  getSlot(id).annotations.push(ann);
  emit();
}

export function updateAnnotation(id: string, annId: string, patch: Partial<Annotation>) {
  commitPending(id);
  const s = getSlot(id);
  const i = s.annotations.findIndex((a) => a.id === annId);
  if (i >= 0) s.annotations[i] = { ...s.annotations[i], ...patch } as Annotation;
  emit();
}

export function removeAnnotation(id: string, annId: string) {
  pushHistory(id);
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
  pushHistory(id);
  slots.set(id, { transform: { ...DEFAULT_TRANSFORM }, annotations: [] });
  emit();
}

/** 全枠をクリア（読込・初期化時）。履歴も破棄する。 */
export function clearAll() {
  slots.clear();
  clearHistory();
  emit();
}

/** 保存用メタ情報を収集（画像本体は別途ZIPへ）。 */
export function collectMeta(): Record<string, SlotMeta> {
  const out: Record<string, SlotMeta> = {};
  for (const [id, s] of slots.entries()) {
    const hasContent = s.imageDataUrl || s.annotations.length > 0;
    if (!hasContent) continue;
    const ext = imageExt(s.imageType);
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
  clearHistory(); // ファイル読込を跨いだ Undo は不可（古い画像参照に戻さない）
  let maxSeq = 0;
  for (const [id, m] of Object.entries(meta)) {
    const annotations = m.annotations ?? [];
    for (const a of annotations) {
      const mm = /^a(\d+)$/.exec(a.id);
      if (mm) maxSeq = Math.max(maxSeq, Number(mm[1]));
    }
    const transform = { ...DEFAULT_TRANSFORM, ...(m.transform ?? {}) };
    transform.scale = clampScale(transform.scale); // 旧/改竄JSONの極端なscaleを丸める
    slots.set(id, {
      imageDataUrl: m.imageFile ? images[m.imageFile] : undefined,
      imageName: m.imageName,
      imageType: m.imageType,
      natW: m.natW,
      natH: m.natH,
      transform,
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
    const ext = imageExt(s.imageType);
    out[`assets/${id}.${ext}`] = s.imageDataUrl;
  }
  return out;
}
