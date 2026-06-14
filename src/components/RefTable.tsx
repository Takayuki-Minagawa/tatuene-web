"use client";
/**
 * 参照表領域（材料ドロップダウン群・部材性能シート等）を、横スクロール可能な
 * コンパクトな表で描画する。フォーム化に向かない密な表をそのまま使えるようにする。
 * 入力/ドロップダウンは CellInput、数式は表示専用、それ以外は素のテキスト。
 */
import React from "react";
import CellInput from "./CellInput";
import { useDisplay, engine } from "@/engine/store";
import { computeMerges, addrOf, colName, widthPx } from "@/lib/grid";
import type { RefTableRegion } from "@/lib/sheet-parser";

function FormulaCell({ sheet, addr }: { sheet: string; addr: string }) {
  return <>{useDisplay(sheet, addr)}</>;
}

export default function RefTable({ sheet, region }: { sheet: string; region: RefTableRegion }) {
  const model = engine().model.sheets[sheet];
  const inputSet = new Set(model.inputs.map((i) => i.addr));
  const dropdownSet = new Set(model.dropdownCells ?? []);
  const { anchors, covered } = computeMerges(model.merges);

  const rows: number[] = [];
  for (let r = region.fromRow; r <= region.toRow; r++) rows.push(r);
  const cols: number[] = [];
  for (let c = region.fromCol; c <= region.toCol; c++) cols.push(c);

  // 横長対策: 内容も入力も無い「空の区切り列」は極小幅に潰し、
  // データのある列も上限でクランプして全体幅を抑える（横スクロールを減らす）。
  const EMPTY_W = 5;
  const MAX_W = 160;
  const colEmpty = cols.map((c) =>
    rows.every((r) => {
      const key = `${r},${c}`;
      if (covered.has(key) || anchors.has(key)) return false; // 結合に関与＝内容あり
      if (inputSet.has(addrOf(r, c))) return false;
      const raw = model.data[r]?.[c];
      return raw === null || raw === undefined || raw === "";
    }),
  );
  const colWidth = (c: number, idx: number) =>
    colEmpty[idx] ? EMPTY_W : Math.min(widthPx(model.colWidths[colName(c)]), MAX_W);

  return (
    <div className="reftable-scroll">
      <table className="reftable">
        <colgroup>
          {cols.map((c, idx) => (
            <col key={c} style={{ width: colWidth(c, idx) }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              {cols.map((c) => {
                const key = `${r},${c}`;
                if (covered.has(key)) return null;
                const span = anchors.get(key);
                // 領域外へはみ出す結合は領域内にクランプ
                const cs = span ? Math.min(span.cs, region.toCol - c + 1) : 1;
                const rs = span ? Math.min(span.rs, region.toRow - r + 1) : 1;
                const addr = addrOf(r, c);
                const raw = model.data[r]?.[c];
                const isFormula = typeof raw === "string" && raw.startsWith("=");
                const isInput = inputSet.has(addr) && !isFormula;
                let content: React.ReactNode = null;
                if (isInput) {
                  content = (
                    <CellInput
                      sheet={sheet}
                      addr={addr}
                      isDropdown={dropdownSet.has(addr)}
                      align="left"
                      label={addr}
                    />
                  );
                } else if (isFormula) {
                  content = <FormulaCell sheet={sheet} addr={addr} />;
                } else if (raw !== null && raw !== undefined) {
                  content = String(raw);
                }
                return (
                  <td
                    key={c}
                    rowSpan={rs > 1 ? rs : undefined}
                    colSpan={cs > 1 ? cs : undefined}
                    className={"reftable-cell" + (isInput ? " is-input" : "")}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
