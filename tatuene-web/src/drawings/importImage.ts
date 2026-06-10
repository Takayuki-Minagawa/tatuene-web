/**
 * 画像取り込みの共通処理（ファイル選択・ドラッグ&ドロップ・クリップボード貼り付け）。
 *
 * - EXIF の向き情報を反映してデコードする（スマホ写真の横倒れ対策）
 * - 長辺が maxDim を超える場合は canvas で縮小し JPEG 再エンコードする
 *   （巨大写真の dataURL 化による ZIP 肥大・PDF 生成低速化を防ぐ）
 * - 透過を持ちうる小さな PNG/GIF はそのまま通す（線画図面の透過保持）
 */

export interface ImportedImage {
  dataUrl: string;
  type: string; // 再エンコード後の MIME（ZIP 内の拡張子はこれに従う）
  natW: number;
  natH: number;
  name: string;
}

export interface ImportOptions {
  maxDim: number;
  jpegQuality: number;
  /** これ以下の dataURL 長なら縮小不要時に元データを無加工で使う */
  passthroughLimit: number;
}

const DEFAULT_OPTIONS: ImportOptions = {
  maxDim: 2000,
  jpegQuality: 0.85,
  passthroughLimit: 1.5 * 1024 * 1024, // dataURL 文字列長 ≒ バイナリの約1.33倍
};

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}

type Decoded = { source: CanvasImageSource; width: number; height: number; cleanup: () => void };

/** EXIF 向きを反映してデコード。createImageBitmap 非対応環境は <img> でフォールバック。 */
async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close() };
    } catch {
      // 古い Safari 等はオプション未対応で例外になることがある → フォールバックへ
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像をデコードできませんでした"));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function importImageBlob(
  blob: Blob,
  name: string,
  opts?: Partial<ImportOptions>
): Promise<ImportedImage> {
  const { maxDim, jpegQuality, passthroughLimit } = { ...DEFAULT_OPTIONS, ...opts };
  const decoded = await decode(blob);
  try {
    const { width, height } = decoded;
    if (!width || !height) throw new Error("画像のサイズを取得できませんでした");

    const needsResize = Math.max(width, height) > maxDim;
    const keepsAlpha = blob.type === "image/png" || blob.type === "image/gif";

    if (!needsResize) {
      const dataUrl = await readAsDataURL(blob);
      // 小さい画像はそのまま。大きい無圧縮画像（巨大PNGスキャン等）のみ JPEG 化。
      if (dataUrl.length <= passthroughLimit || keepsAlpha) {
        return { dataUrl, type: blob.type || "image/png", natW: width, natH: height, name };
      }
    }

    const scale = needsResize ? maxDim / Math.max(width, height) : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas を利用できません");

    // 縮小しても小さく収まる透過画像は PNG を維持、それ以外は白背景 JPEG
    const usePng = keepsAlpha && needsResize;
    if (!usePng) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(decoded.source, 0, 0, w, h);

    if (usePng) {
      const png = canvas.toDataURL("image/png");
      if (png.length <= passthroughLimit) {
        return { dataUrl: png, type: "image/png", natW: w, natH: h, name };
      }
      // 縮小後も巨大な PNG は白背景 JPEG に落とす
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(decoded.source, 0, 0, w, h);
    }
    const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
    return { dataUrl, type: "image/jpeg", natW: w, natH: h, name };
  } finally {
    decoded.cleanup();
  }
}

/** DataTransfer / クリップボードから最初の画像ファイルを取り出す。 */
export function pickImageFile(items: DataTransferItemList | null | undefined): File | null {
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
