/**
 * 忠実性チェック: workbook-model.json の数式を HyperFormula で再計算し、
 * Excel のキャッシュ計算値(cached)とセル単位で突合する。
 * 全一致 = Excel原本の数式をそのまま忠実に再現できている証明。
 */
import { HyperFormula } from "hyperformula";
import * as fs from "fs";
import * as path from "path";
import { buildAliasMap, transformData } from "../src/engine/transform";

const modelPath = path.join(__dirname, "..", "src", "data", "workbook-model.json");
const model = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
const cachedPath = path.join(__dirname, "..", "src", "data", "workbook-cached.json");
const cachedData = JSON.parse(fs.readFileSync(cachedPath, "utf-8")).cached as Record<string, any[][]>;

const alias = buildAliasMap(model.sheetOrder);
const sheets: Record<string, any[][]> = {};
for (const name of model.sheetOrder) {
  sheets[alias.get(name)!] = transformData(model.sheets[name].data, alias);
}

const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });

function isError(v: any): boolean {
  return v != null && typeof v === "object" && ("type" in v || "value" in v);
}
function errStr(v: any): string {
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return String(v);
}
function norm(v: any): any {
  if (v === null || v === undefined || v === "") return null;
  return v;
}
function numClose(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return diff <= 1e-6 || diff <= scale * 1e-9;
}

// 原本由来の壊れた数式（=P11+#REF!+#REF!+#REF! 等）。Excelでも #VALUE! エラーで、
// HFは #REF! を返す（どちらもエラー・エラーコードのみ相違）。評価シート帳票には影響しない。
// これらは「既知の不一致」として許容し、それ以外の不一致のみを失敗とみなす。
const KNOWN_BROKEN = new Set<string>([
  "計算シート（現状）!E275",
  "計算シート（現状）!E282",
  "計算シート（現状）!K282",
  "計算シート（改修後）!E319",
  "計算シート（改修後）!E326",
  "計算シート（改修後）!K326",
]);

let formulaCells = 0;
let matched = 0;
const mismatches: string[] = [];
const knownIssues: string[] = [];

for (const name of model.sheetOrder) {
  const sh = model.sheets[name];
  const sheetId = hf.getSheetId(alias.get(name)!)!;
  for (let r = 0; r < sh.maxRow; r++) {
    for (let c = 0; c < sh.maxCol; c++) {
      const raw = sh.data[r]?.[c];
      if (typeof raw !== "string" || !raw.startsWith("=")) continue;
      formulaCells++;
      const cached = norm(cachedData[name][r]?.[c]);
      const got = norm(hf.getCellValue({ sheet: sheetId, row: r, col: c }));

      let ok = false;
      if (cached === null && got === null) ok = true;
      // 空セル参照: Excelは0表示、HFは空 → 数値0と空を同一視
      else if (cached === 0 && got === null) ok = true;
      else if (cached === null && got === 0) ok = true;
      else if (isError(got) || (typeof cached === "string" && cached.startsWith("#"))) {
        const ge = isError(got) ? errStr(got) : String(got);
        const ce = typeof cached === "string" ? cached : String(cached);
        ok = ge === ce;
      } else if (typeof cached === "number" && typeof got === "number") {
        ok = numClose(cached, got);
      } else if (typeof cached === "boolean" || typeof got === "boolean") {
        ok = String(cached).toUpperCase() === String(got).toUpperCase();
      } else {
        ok = String(cached) === String(got);
      }

      if (ok) matched++;
      else {
        const addr = `${name}!${colLetter(c)}${r + 1}`;
        const line = `${addr}  formula=${raw.slice(0, 48)}  excel=${JSON.stringify(cached)}  hf=${JSON.stringify(isError(got) ? errStr(got) : got)}`;
        if (KNOWN_BROKEN.has(addr)) knownIssues.push(line);
        else mismatches.push(line);
      }
    }
  }
}

function colLetter(c: number): string {
  let s = "";
  c += 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

console.log(`\n=== 忠実性チェック結果 ===`);
console.log(`数式セル       : ${formulaCells}`);
console.log(`一致           : ${matched}`);
console.log(`既知の不一致   : ${knownIssues.length} (原本由来の壊れた#REF!・帳票に影響なし)`);
console.log(`想定外の不一致 : ${mismatches.length}`);

if (knownIssues.length) {
  console.log(`\n--- 既知の不一致（許容） ---`);
  for (const m of knownIssues) console.log("  " + m);
}

if (mismatches.length) {
  console.log(`\n--- 想定外の不一致 ---`);
  for (const m of mismatches.slice(0, 80)) console.log("  " + m);
  console.log(`\n❌ 想定外の不一致が ${mismatches.length} 件あります。`);
  process.exit(1);
} else {
  console.log(
    `\n✅ Excel原本の数式を忠実に再現できています（一致 ${matched} + 既知の不一致 ${knownIssues.length} = ${formulaCells}）。`
  );
}
