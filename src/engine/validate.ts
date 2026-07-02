/**
 * 入力データチェック。PDF出力前に実行する。
 * エラー(出力ブロック) と 警告(確認の上で出力可) に分類。
 */
import { WorkbookEngine, isError, isBlank } from "./workbook";
import { SHEETS } from "@/lib/sheets";

export interface Issue {
  level: "error" | "warning";
  label: string;
  message: string;
  sheet: string;
  addr?: string;
}

const REQUIRED: { sheet: string; addr: string; label: string; numeric?: boolean }[] = [
  { sheet: SHEETS.cover, addr: "E30", label: "工事名" },
  { sheet: SHEETS.cover, addr: "E34", label: "住所" },
  { sheet: SHEETS.cover, addr: "E42", label: "建築年" },
  { sheet: SHEETS.currentCalc, addr: "D11", label: "床面積", numeric: true },
  { sheet: SHEETS.currentCalc, addr: "D12", label: "外壁面長さ", numeric: true },
  { sheet: SHEETS.currentCalc, addr: "N12", label: "天井高さ", numeric: true },
];

// 開口部のW(D列)/H(E列)のペア（片方のみ入力を検出）
const OPENING_ROWS: { rows: number[]; label: string }[] = [
  { rows: [20, 21, 22, 23, 24, 25, 26], label: "開口部1（窓）" },
  { rows: [29, 30], label: "開口部2（外部ドア）" },
  { rows: [34, 35, 36, 37, 38], label: "開口部3（室内ドア）" },
];

export function validate(eng: WorkbookEngine): Issue[] {
  const issues: Issue[] = [];
  const cur = SHEETS.currentCalc;

  // 1) 必須項目
  for (const f of REQUIRED) {
    const v = eng.getInputRaw(f.sheet, f.addr);
    if (isBlank(v)) {
      issues.push({
        level: "error",
        label: f.label,
        message: `「${f.label}」が未入力です。`,
        sheet: f.sheet,
        addr: f.addr,
      });
    } else if (f.numeric) {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) {
        issues.push({
          level: "error",
          label: f.label,
          message: `「${f.label}」は正の数値を入力してください（現在: ${v}）。`,
          sheet: f.sheet,
          addr: f.addr,
        });
      }
    }
  }

  // 2) 開口部 W/H の片側のみ入力
  for (const grp of OPENING_ROWS) {
    for (const r of grp.rows) {
      const w = eng.getInputRaw(cur, `D${r}`);
      const h = eng.getInputRaw(cur, `E${r}`);
      if (isBlank(w) !== isBlank(h)) {
        issues.push({
          level: "warning",
          label: grp.label,
          message: `${grp.label} ${r}行目: W と H のどちらか一方のみ入力されています。両方入力してください。`,
          sheet: cur,
          addr: `D${r}`,
        });
      }
    }
  }

  // 3) 主要な計算結果の健全性（総熱損失量・UA値・等級）
  const headline: { addr: string; label: string }[] = [
    { addr: "Y35", label: "総熱損失量（現状）" },
    { addr: "Y37", label: "総熱損失量（改修後）" },
    { addr: "AH35", label: "UA値（現状）" },
    { addr: "AM35", label: "断熱等級（現状）" },
  ];
  const reqAllFilled = !issues.some((i) => i.level === "error");
  for (const h of headline) {
    const v = eng.getValue(SHEETS.evaluation, h.addr);
    if (isError(v)) {
      issues.push({
        level: "warning",
        label: h.label,
        message: `${h.label}が計算エラー(${v.value})です。建材の選択と各部の面積入力をご確認ください。`,
        sheet: SHEETS.evaluation,
        addr: h.addr,
      });
    } else if (reqAllFilled && h.addr === "Y35" && (v === null || v === 0)) {
      issues.push({
        level: "warning",
        label: h.label,
        message:
          "総熱損失量（現状）が0です。各部の建材選択・面積・開口部の入力が不足している可能性があります。",
        sheet: SHEETS.evaluation,
        addr: h.addr,
      });
    }
  }

  return issues;
}
