import { describe, it, expect, beforeEach } from "vitest";
import { engine, resetDefaults, setInput } from "@/engine/store";
import { buildSaveFile, applyData, type SaveFile } from "./storage";

// テスト対象の入力セルを実モデルから選ぶ（ハードコード回避）
const SHEET = "表紙";
const ADDR = engine().model.sheets[SHEET].inputs[0].addr;
const KEY = `${SHEET}!${ADDR}`;

beforeEach(() => {
  resetDefaults();
});

describe("storage 保存→反映の往復", () => {
  it("buildSaveFile が入力値を含み、applyData で復元できる", () => {
    setInput(SHEET, ADDR, "RT_TEST_値");

    const saved = buildSaveFile();
    expect(saved.app).toBe("tatuene-insulation");
    expect(saved.inputs[KEY]).toBe("RT_TEST_値");

    // 別の値に変えてから保存データを反映すると元に戻る
    setInput(SHEET, ADDR, "別の値");
    expect(engine().getInputRaw(SHEET, ADDR)).toBe("別の値");

    applyData(saved, {});
    expect(engine().getInputRaw(SHEET, ADDR)).toBe("RT_TEST_値");
  });

  it("入力欄に数式(=...)を入れても原文が保存・復元される（評価値に化けない）", () => {
    setInput(SHEET, ADDR, "=1+2");
    const saved = buildSaveFile();
    expect(saved.inputs[KEY]).toBe("=1+2"); // "3" ではなく原文

    resetDefaults();
    applyData(saved, {});
    expect(engine().getInputRaw(SHEET, ADDR)).toBe("=1+2");
  });

  it("applyData は達エネ保存データでないと例外を投げる", () => {
    const bad = { app: "other-app", inputs: {} } as unknown as SaveFile;
    expect(() => applyData(bad, {})).toThrow();
  });

  it("applyData は inputs 欠落で例外を投げる", () => {
    const bad = { app: "tatuene-insulation" } as unknown as SaveFile;
    expect(() => applyData(bad, {})).toThrow();
  });

  it("旧 app id（katsuene-insulation）も受け付ける", () => {
    const legacy: SaveFile = {
      app: "katsuene-insulation",
      version: "1.0.0",
      savedAt: "2026-01-01T00:00:00.000Z",
      inputs: { [KEY]: "旧形式" },
    };
    expect(() => applyData(legacy, {})).not.toThrow();
    expect(engine().getInputRaw(SHEET, ADDR)).toBe("旧形式");
  });
});
