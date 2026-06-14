"use client";
/**
 * 編集可能セル（入力 / 建材ドロップダウン）。SheetGrid から抽出。
 */
import React, { useEffect, useRef, useState } from "react";
import { setInput, useInputValue } from "@/engine/store";
import { MATERIAL_NAMES } from "@/lib/materials";
import type { TextAlign } from "@/lib/grid";

// 建材リストは不変。option 要素を一度だけ生成して使い回す（毎回の再生成を回避）。
const MATERIAL_OPTIONS = MATERIAL_NAMES.map((m) => (
  <option key={m} value={m}>
    {m}
  </option>
));

type NavDir = "next" | "prev" | "up" | "down";
function parseAddr(a: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(a);
  if (!m) return { col: 0, row: 0 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}
// 入力欄間をキーボードで移動する。up/down は同じ列の最も近い行へ、
// next/prev は DOM 順（フォーム送り）。フォーカス移動で現在セルは onBlur 確定される。
function focusAdjacentInput(cur: HTMLElement, dir: NavDir) {
  const root = (cur.closest(".input-guide") as HTMLElement) ?? document.body;
  const inputs = Array.from(root.querySelectorAll<HTMLElement>("[data-input-addr]"));
  const idx = inputs.indexOf(cur);
  if (idx < 0) return;
  if (dir === "next") return inputs[idx + 1]?.focus();
  if (dir === "prev") return inputs[idx - 1]?.focus();
  const c = parseAddr(cur.getAttribute("data-input-addr") || "");
  let best: HTMLElement | null = null;
  let bestRow = dir === "down" ? Infinity : -Infinity;
  for (const el of inputs) {
    const a = parseAddr(el.getAttribute("data-input-addr") || "");
    if (a.col !== c.col) continue;
    if (dir === "down" && a.row > c.row && a.row < bestRow) { best = el; bestRow = a.row; }
    if (dir === "up" && a.row < c.row && a.row > bestRow) { best = el; bestRow = a.row; }
  }
  (best ?? inputs[dir === "down" ? idx + 1 : idx - 1])?.focus();
}

function CellInput({
  sheet,
  addr,
  isDropdown,
  align,
  numeric = false,
  label,
}: {
  sheet: string;
  addr: string;
  isDropdown: boolean;
  align: TextAlign;
  numeric?: boolean; // 数値セルなら decimal キーパッドを出す
  label?: string; // スクリーンリーダー用ラベル（近傍の見出し文字）
}) {
  // このセルの値だけを購読（他セルの編集では再描画されない）
  const raw = useInputValue(sheet, addr);
  const engineStr = raw === null || raw === undefined ? "" : String(raw);
  const [local, setLocal] = useState(engineStr);
  const focused = useRef(false);

  useEffect(() => {
    // 外部（読込/初期化/他経路）でこのセルの値が変わったら、未フォーカス時のみ同期
    if (!focused.current) setLocal(engineStr);
  }, [engineStr]);

  if (isDropdown) {
    return (
      <select
        className="cell-edit cell-select"
        value={engineStr || "無し"}
        aria-label={label || addr}
        onChange={(e) => setInput(sheet, addr, e.target.value)}
      >
        {!MATERIAL_NAMES.includes(engineStr) && engineStr !== "" && (
          <option value={engineStr}>{engineStr}</option>
        )}
        {MATERIAL_OPTIONS}
      </select>
    );
  }
  return (
    <input
      className={"cell-edit" + (engineStr === "" ? " is-empty" : "")}
      data-input-addr={addr}
      data-empty={engineStr === "" ? "1" : undefined}
      aria-label={label || addr}
      inputMode={numeric ? "decimal" : undefined}
      style={{ textAlign: align }}
      value={local}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (local !== engineStr) setInput(sheet, addr, local);
      }}
      onKeyDown={(e) => {
        // Enter:次の入力欄へ / Shift+Enter:前へ / 上下矢印:同列の隣の行へ
        // （単一行inputでは上下矢印はキャレット移動しないので奪っても安全）
        if (e.key === "Enter") {
          e.preventDefault();
          focusAdjacentInput(e.currentTarget, e.shiftKey ? "prev" : "next");
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          focusAdjacentInput(e.currentTarget, "down");
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          focusAdjacentInput(e.currentTarget, "up");
        }
      }}
    />
  );
}

// props（sheet/addr/isDropdown/align）が同じなら再描画しない。
// 値の更新は内部の useInputValue 購読で行う。
export default React.memo(CellInput);
