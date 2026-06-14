import { describe, it, expect } from "vitest";
import { coerce, formatByNumFmt } from "./workbook";

describe("coerce", () => {
  it("null/空白は null", () => {
    expect(coerce(null)).toBeNull();
    expect(coerce("")).toBeNull();
    expect(coerce("   ")).toBeNull();
  });

  it("数値はそのまま", () => {
    expect(coerce(42)).toBe(42);
    expect(coerce(-3.5)).toBe(-3.5);
    expect(coerce(0)).toBe(0);
  });

  it("半角の数値文字列は number 化", () => {
    expect(coerce("100")).toBe(100);
    expect(coerce("-12.5")).toBe(-12.5);
    expect(coerce(" 7 ")).toBe(7);
  });

  it("全角数字・全角小数点・全角マイナスを number 化", () => {
    expect(coerce("１２３")).toBe(123);
    expect(coerce("３．１４")).toBe(3.14);
    expect(coerce("－５")).toBe(-5);
  });

  it("先頭 = の文字列は数式としてそのまま保持", () => {
    expect(coerce("=1+2")).toBe("=1+2");
    expect(coerce("=SUM(A1:A3)")).toBe("=SUM(A1:A3)");
  });

  it("数値でない文字列はそのまま文字列", () => {
    expect(coerce("木造")).toBe("木造");
    expect(coerce("12a")).toBe("12a");
    expect(coerce("1,000")).toBe("1,000"); // カンマ入りは数値判定しない
  });
});

describe("formatByNumFmt", () => {
  it("非数値・非有限はそのまま文字列化", () => {
    expect(formatByNumFmt(NaN, "0.00")).toBe("NaN");
    expect(formatByNumFmt(Infinity, "0.00")).toBe("Infinity");
  });

  it("General / 空フォーマットは余分な桁を落とす", () => {
    expect(formatByNumFmt(1.5, "General")).toBe("1.5");
    expect(formatByNumFmt(1.2345678, "")).toBe("1.234568");
    expect(formatByNumFmt(3, "General")).toBe("3");
  });

  it("小数桁を fmt から推定", () => {
    expect(formatByNumFmt(1.2, "0.00")).toBe("1.20");
    expect(formatByNumFmt(1.239, "0.00")).toBe("1.24");
    expect(formatByNumFmt(5, "0")).toBe("5");
  });

  it("パーセント書式は100倍して % 付与", () => {
    expect(formatByNumFmt(0.1234, "0.0%")).toBe("12.3%");
    expect(formatByNumFmt(0.5, "0%")).toBe("50%");
  });

  it("千区切り", () => {
    expect(formatByNumFmt(1234567, "#,##0")).toBe("1,234,567");
    expect(formatByNumFmt(1234.5, "#,##0.0")).toBe("1,234.5");
    expect(formatByNumFmt(-12345, "#,##0")).toBe("-12,345");
  });
});
