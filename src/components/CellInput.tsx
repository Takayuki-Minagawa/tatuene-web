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

function CellInput({
  sheet,
  addr,
  isDropdown,
  align,
}: {
  sheet: string;
  addr: string;
  isDropdown: boolean;
  align: TextAlign;
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
      style={{ textAlign: align }}
      value={local}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (local !== engineStr) setInput(sheet, addr, local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

// props（sheet/addr/isDropdown/align）が同じなら再描画しない。
// 値の更新は内部の useInputValue 購読で行う。
export default React.memo(CellInput);
