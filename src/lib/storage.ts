"use client";
/**
 * 入力データ＋図面の保存・読込。
 *  - 保存: ZIPバンドル（tatuene.json ＝入力値・図面メタ ＋ assets/<枠>.png ＝図面画像）。
 *    画像はJSONに埋め込まず別ファイルとして同梱する。
 *  - 読込: .zip（フル）/ .json（入力のみ・旧形式）の両対応。
 */
import { engine, applyInputs } from "@/engine/store";
import {
  collectMeta,
  collectImages,
  restore,
  clearAll,
  safeImageMime,
  type SlotMeta,
} from "@/drawings/store";
import { APP_VERSION } from "@/lib/version";
import { SHEETS } from "@/lib/sheets";
import { sanitizeFileName } from "@/lib/filename";

const SAVE_APP_ID = "tatuene-insulation";
const LEGACY_SAVE_APP_ID = "katsuene-insulation";
const SAVE_JSON = "tatuene.json";
const LEGACY_SAVE_JSON = "katsuene.json";

type SaveAppId = typeof SAVE_APP_ID | typeof LEGACY_SAVE_APP_ID;

export interface SaveFile {
  app: SaveAppId;
  version: string;
  savedAt: string;
  title?: string;
  inputs: Record<string, string | number>;
  drawings?: Record<string, SlotMeta>;
}

// 表紙の「工事名」セル。保存ファイル名・PDFファイル名のタイトルに使う。
const TITLE_CELL = "E30";

/** 表紙の工事名（未入力なら空文字）。保存・PDFのタイトル共通。 */
export function currentTitle(): string {
  return (engine().getInputRaw(SHEETS.cover, TITLE_CELL) as string) || "";
}

export function buildSaveFile(): SaveFile {
  const inputs = engine().collectInputs();
  const title = currentTitle() || "無題";
  const drawings = collectMeta();
  return {
    app: SAVE_APP_ID,
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    title,
    inputs,
    ...(Object.keys(drawings).length ? { drawings } : {}),
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ZIPバンドルを保存（入力＋図面＋画像を1ファイルに）。 */
export async function downloadBundle() {
  const data = buildSaveFile();
  const safeTitle = sanitizeFileName(data.title || "診断");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(SAVE_JSON, JSON.stringify(data, null, 1));
  const images = collectImages(); // { "assets/slotX.png": dataURL }
  for (const [path, dataUrl] of Object.entries(images)) {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) continue;
    zip.file(path, dataUrl.slice(comma + 1), { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `逹エネ断熱_${safeTitle}.zip`);
}

/** 保存データを反映（ファイル読込・ドラフト復元の共通処理）。 */
export function applyData(data: SaveFile, images: Record<string, string>): void {
  if ((data.app !== SAVE_APP_ID && data.app !== LEGACY_SAVE_APP_ID) || !data.inputs) {
    throw new Error("このファイルは逹エネ断熱シミュレーターの保存データではありません。");
  }
  applyInputs(data.inputs);
  clearAll();
  if (data.drawings) restore(data.drawings, images);
}

/** .zip / .json を読み込んで反映。 */
export async function loadFile(file: File): Promise<void> {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
  if (isZip) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const jsonEntry = zip.file(SAVE_JSON) ?? zip.file(LEGACY_SAVE_JSON);
    if (!jsonEntry) throw new Error(`バンドル内に ${SAVE_JSON} が見つかりません。`);
    const data = parseSaveJson(await jsonEntry.async("string"));
    const images: Record<string, string> = {};
    // 信頼できないファイルの暴走（zip bomb 等）に備え、画像枚数と総量に上限を設ける
    const MAX_IMAGES = 24;
    const MAX_TOTAL_B64 = 64 * 1024 * 1024; // base64 文字列の合計（≒48MBの画像）
    let count = 0;
    let totalB64 = 0;
    for (const m of Object.values(data.drawings ?? {})) {
      if (!m.imageFile) continue;
      if (++count > MAX_IMAGES) throw new Error("画像の数が多すぎます。ファイルを確認してください。");
      const f = zip.file(m.imageFile);
      if (!f) continue;
      const b64 = await f.async("base64");
      totalB64 += b64.length;
      if (totalB64 > MAX_TOTAL_B64) throw new Error("画像データが大きすぎます。ファイルを確認してください。");
      // MIME は許可リストで検証（不正な type の流用を防ぐ）
      images[m.imageFile] = `data:${safeImageMime(m.imageType)};base64,${b64}`;
    }
    return applyData(data, images);
  } else {
    const data = parseSaveJson(await file.text());
    return applyData(data, {});
  }
}

/** 保存JSONをパース。壊れている場合はユーザー向けの日本語メッセージにする。 */
function parseSaveJson(text: string): SaveFile {
  try {
    return JSON.parse(text) as SaveFile;
  } catch {
    throw new Error("ファイルが壊れているか、対応していない形式です（データを読み取れませんでした）。");
  }
}
