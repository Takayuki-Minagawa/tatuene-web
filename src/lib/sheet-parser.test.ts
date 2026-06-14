import { describe, it, expect } from "vitest";
import { parseSheet } from "./sheet-parser";
import { getSheetLayout, SHEET_LAYOUTS } from "./sheet-layout";
import { computeMerges } from "./grid";
import { SHEETS } from "./sheets";
import modelJson from "@/data/workbook-model.json";
import type { WorkbookModelJson } from "@/engine/workbook";

const model = modelJson as unknown as WorkbookModelJson;

/** マージ非被覆のアンカー入力（実際に描画される入力）の番地集合。 */
function renderableInputs(sheet: string): Set<string> {
  const sm = model.sheets[sheet];
  const { covered } = computeMerges(sm.merges);
  return new Set(sm.inputs.filter((i) => !covered.has(`${i.row},${i.col}`)).map((i) => i.addr));
}

function allItemAddrs(sheet: string): { editable: Set<string>; all: string[] } {
  const form = parseSheet(sheet, model.sheets[sheet], getSheetLayout(sheet));
  const editable = new Set<string>();
  const all: string[] = [];
  for (const sec of form.sections) {
    if (sec.kind === "reftable") continue; // 表領域は番地を列挙しない（領域で網羅）
    for (const it of sec.items) {
      all.push(it.addr);
      if (it.kind === "input" || it.kind === "dropdown") editable.add(it.addr);
    }
  }
  return { editable, all };
}

describe("parseSheet — 網羅性（入力の取りこぼし/重複なし）", () => {
  for (const sheet of Object.keys(SHEET_LAYOUTS)) {
    it(`${sheet}: 描画される全入力がフォームに現れる（除外を除く）`, () => {
      const layout = getSheetLayout(sheet)!;
      const excluded = new Set<string>();
      for (const sec of layout.sections)
        for (const a of sec.excludeAddrs ?? []) excluded.add(a);
      // reftable 領域の入力は items に出ないので、網羅判定からは除外する。
      const reftableAddrs = new Set<string>();
      for (const sec of layout.sections) {
        if (!sec.reftable) continue;
        const sm = model.sheets[sheet];
        for (const i of sm.inputs) {
          if (
            i.row >= sec.reftable.fromRow && i.row <= sec.reftable.toRow &&
            i.col >= sec.reftable.fromCol && i.col <= sec.reftable.toCol
          ) reftableAddrs.add(i.addr);
        }
      }
      const expected = new Set(
        [...renderableInputs(sheet)].filter((a) => !excluded.has(a) && !reftableAddrs.has(a)),
      );
      const { editable, all } = allItemAddrs(sheet);
      // 重複なし
      const seen = new Set<string>();
      for (const a of all) {
        expect(seen.has(a), `重複: ${a}`).toBe(false);
        seen.add(a);
      }
      // 取りこぼしなし（期待集合 ⊆ フォーム項目）
      for (const a of expected) {
        expect(editable.has(a), `フォームに欠落: ${a}`).toBe(true);
      }
      // 余計な入力を出していない（除外したものが出ていない）
      for (const a of excluded) {
        expect(editable.has(a), `除外したはずが出現: ${a}`).toBe(false);
      }
    });
  }
});

describe("parseSheet — 表紙の構成", () => {
  const form = parseSheet(SHEETS.cover, model.sheets[SHEETS.cover], getSheetLayout(SHEETS.cover));
  const byId = Object.fromEntries(form.sections.map((s) => [s.id, s]));

  it("「その他」セクションが発生しない（全項目が意図的に配置）", () => {
    expect(form.sections.find((s) => s.id === "__rest__")).toBeUndefined();
  });

  it("物件情報: 工事名(E30)が numeric でないテキスト項目", () => {
    const e30 = byId["project"].items.find((i) => i.addr === "E30")!;
    expect(e30.label).toBe("工事名");
    expect(e30.kind).toBe("input");
  });

  it("建築年(西暦)H42 は読み取り専用の数式項目", () => {
    const h42 = byId["project"].items.find((i) => i.addr === "H42")!;
    expect(h42.kind).toBe("formula");
  });

  it("診断者: 所属(E49)・氏名(I49) が並ぶ", () => {
    const ids = byId["diagnostician"].items.map((i) => i.addr);
    expect(ids).toEqual(["E49", "I49"]);
  });

  it("診断者所属の下の未使用セル(E52等)は現れない", () => {
    const { editable } = allItemAddrs(SHEETS.cover);
    for (const a of ["E52", "E53", "I52", "I53"]) expect(editable.has(a)).toBe(false);
  });

  it("about セクションは C23 の解説文を持つ", () => {
    expect(byId["about"].guidance).toContain("このシミュレーター");
  });
});

describe("parseSheet — 間取り図（図面セクション）", () => {
  const cases: [string, string][] = [
    [SHEETS.currentCalc, "slot1"],
    [SHEETS.retrofitCalc, "slot2"],
  ];
  for (const [sheet, slotId] of cases) {
    it(`${sheet}: plan は drawing セクションで ${slotId} を共有する`, () => {
      const form = parseSheet(sheet, model.sheets[sheet], getSheetLayout(sheet));
      const plan = form.sections.find((s) => s.id === "plan")!;
      expect(plan.kind).toBe("drawing");
      expect(plan.drawingSlotId).toBe(slotId);
      expect(plan.items).toEqual([]); // 作図セルはフォーム項目化しない
    });

    it(`${sheet}: 作図グリッドのセルが「その他」に漏れない`, () => {
      const form = parseSheet(sheet, model.sheets[sheet], getSheetLayout(sheet));
      const rest = form.sections.find((s) => s.id === "__rest__");
      // 41〜65行(作図グリッド)の番地が項目に出ていないこと
      const restAddrs = (rest?.items ?? []).map((i) => i.addr);
      for (const a of restAddrs) {
        const row = Number(/\d+/.exec(a)![0]);
        expect(row < 41 || row > 65, `作図セルが その他 に漏れた: ${a}`).toBe(true);
      }
    });
  }
});
