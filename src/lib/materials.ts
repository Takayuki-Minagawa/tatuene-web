/**
 * 建材マスタ（material-master.json）の型付き再エクスポート。
 * JSON は scripts/extract-workbook.py が Excel の部材性能シートから自動生成する。
 */
import master from "@/data/material-master.json";

export interface Material {
  row: number; // 部材性能シート上の行番号
  name: string;
  R: number | null; // 熱抵抗 [m2K/W]
  thickness: number | null; // 厚さ [mm]
  lambda: number | null; // 熱伝導率 [W/mK]
  U: number | null; // 熱貫流率 [W/m2K]
}

export interface MaterialMaster {
  range: string; // 抽出元レンジ（例: 部材性能シート!B12:B142）
  materials: Material[];
}

export const MATERIAL_MASTER: MaterialMaster = master;

export const MATERIAL_NAMES: string[] = MATERIAL_MASTER.materials.map((m) => m.name);

// ---- 建材名リストの動的取得（部材性能シートの現在値を反映） ----
// ユーザーが部材性能シートで追加・変更した建材をドロップダウンへ反映する。
// 原本Excelの名称には末尾スペースが混在するため trim で正規化する（選択値は
// coerce() で trim されて保存されるので、リスト側も trim しないと照合できない）。
import { engine } from "@/engine/store";

const MASTER_SHEET = "部材性能シート";
const NAME_FIRST_ROW = 12; // 「無し」の行
const NAME_LAST_ROW = 170; // 建材表の最終行（追加用の空き行を含む）

let namesCacheVersion = -1;
let namesCache: string[] = MATERIAL_NAMES.map((n) => n.trim());

/**
 * 現在の建材名リスト（trim済み・空行と重複を除去）。
 * エンジンの version ごとに1回だけ再計算し、内容が変わらなければ
 * 同一の配列インスタンスを返す（ドロップダウンの再描画を抑える）。
 */
export function materialNamesAt(version: number): string[] {
  if (version === namesCacheVersion) return namesCache;
  namesCacheVersion = version;
  const eng = engine();
  const seen = new Set<string>();
  const names: string[] = [];
  for (let r = NAME_FIRST_ROW; r <= NAME_LAST_ROW; r++) {
    const v = eng.getInputRaw(MASTER_SHEET, `B${r}`);
    const s = v === null || v === undefined ? "" : String(v).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    names.push(s);
  }
  if (names.join("\n") !== namesCache.join("\n")) namesCache = names;
  return namesCache;
}
