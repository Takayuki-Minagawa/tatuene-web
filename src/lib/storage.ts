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
  type SlotMeta,
} from "@/drawings/store";
import {
  normalizeVersionSettings,
  type VersionSettings,
} from "@/lib/version";

const SAVE_APP_ID = "tatuene-insulation";
const LEGACY_SAVE_APP_ID = "katsuene-insulation";
const SAVE_JSON = "tatuene.json";
const LEGACY_SAVE_JSON = "katsuene.json";

type SaveAppId = typeof SAVE_APP_ID | typeof LEGACY_SAVE_APP_ID;

export interface SaveFile {
  app: SaveAppId;
  version: string;
  versionSettings?: VersionSettings;
  savedAt: string;
  title?: string;
  inputs: Record<string, string | number>;
  drawings?: Record<string, SlotMeta>;
}

export function buildSaveFile(versionSettings?: VersionSettings): SaveFile {
  const inputs = engine().collectInputs();
  const title = (engine().getInputRaw("表紙", "E30") as string) || "無題";
  const drawings = collectMeta();
  const versions = normalizeVersionSettings(versionSettings);
  return {
    app: SAVE_APP_ID,
    version: versions.official,
    versionSettings: versions,
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
export async function downloadBundle(versionSettings?: VersionSettings) {
  const data = buildSaveFile(versionSettings);
  const safeTitle = (data.title || "診断").replace(/[\\/:*?"<>|]/g, "_");
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
export function applyData(data: SaveFile, images: Record<string, string>): VersionSettings | null {
  if ((data.app !== SAVE_APP_ID && data.app !== LEGACY_SAVE_APP_ID) || !data.inputs) {
    throw new Error("このファイルは逹エネ断熱シミュレーターの保存データではありません。");
  }
  applyInputs(data.inputs);
  clearAll();
  if (data.drawings) restore(data.drawings, images);
  return data.versionSettings ? normalizeVersionSettings(data.versionSettings) : null;
}

/** .zip / .json を読み込んで反映。 */
export async function loadFile(file: File): Promise<VersionSettings | null> {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
  if (isZip) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const jsonEntry = zip.file(SAVE_JSON) ?? zip.file(LEGACY_SAVE_JSON);
    if (!jsonEntry) throw new Error(`バンドル内に ${SAVE_JSON} が見つかりません。`);
    const data = JSON.parse(await jsonEntry.async("string")) as SaveFile;
    const images: Record<string, string> = {};
    for (const m of Object.values(data.drawings ?? {})) {
      if (!m.imageFile) continue;
      const f = zip.file(m.imageFile);
      if (!f) continue;
      const b64 = await f.async("base64");
      images[m.imageFile] = `data:${m.imageType || "image/png"};base64,${b64}`;
    }
    return applyData(data, images);
  } else {
    const data = JSON.parse(await file.text()) as SaveFile;
    return applyData(data, {});
  }
}
