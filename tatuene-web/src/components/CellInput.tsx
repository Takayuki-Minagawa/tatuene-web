"use client";
/**
 * 編集可能セル（入力 / 建材ドロップダウン）。SheetGrid から抽出。
 */
import React, { useEffect, useRef, useState } from "react";
import { engine, setInput, useEngineVersion } from "@/engine/store";
import { MATERIAL_NAMES } from "@/lib/materials";
import type { TextAlign } from "@/lib/grid";

export default function CellInput({
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
  const v = useEngineVersion();
  const raw = engine().getInputRaw(sheet, addr);
  const engineStr = raw === null || raw === undefined ? "" : String(raw);
  const [local, setLocal] = useState(engineStr);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(engineStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

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
        {MATERIAL_NAMES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="cell-edit"
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
