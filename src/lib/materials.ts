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
