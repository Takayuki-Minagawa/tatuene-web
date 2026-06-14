import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import {
  setInput,
  resetDefaults,
  useInputValue,
  useDisplay,
} from "./store";

// セル単位購読（useInputValue / useDisplay）が、値の変化で確実に再描画されることを保証する。
// これが壊れると「入力しても数式セルの表示が更新されない」回帰になるが、忠実性チェックでは
// 捕捉できない（あれはエンジンの計算値のみを見る）。

function InputProbe({ sheet, addr }: { sheet: string; addr: string }) {
  const v = useInputValue(sheet, addr);
  return <span data-testid="in">{v === null || v === undefined ? "" : String(v)}</span>;
}

function DisplayProbe({ sheet, addr }: { sheet: string; addr: string }) {
  return <span data-testid="disp">{useDisplay(sheet, addr)}</span>;
}

beforeEach(() => resetDefaults());
afterEach(() => cleanup());

describe("セル単位購読のリアクティビティ", () => {
  it("useInputValue は自セルの入力変更で更新される", () => {
    render(<InputProbe sheet="表紙" addr="E30" />);
    act(() => {
      setInput("表紙", "E30", "HELLO");
    });
    expect(screen.getByTestId("in").textContent).toBe("HELLO");
  });

  it("useDisplay は依存する入力の変更で更新される（評価シートE5 = 表紙!E30 参照）", () => {
    render(<DisplayProbe sheet="評価シート" addr="E5" />);
    act(() => {
      setInput("表紙", "E30", "REACT_TEST");
    });
    expect(screen.getByTestId("disp").textContent).toBe("REACT_TEST");
  });
});
