"use client";
/**
 * 参照表領域（材料ドロップダウン群・部材性能シート等）を、横スクロール可能な
 * コンパクトな表で描画する。フォーム化に向かない密な表をそのまま使えるようにする。
 * 入力/ドロップダウンは CellInput、数式は表示専用、それ以外は素のテキスト。
 */
import React, { useLayoutEffect, useRef } from "react";
import CellInput from "./CellInput";
import { engine, useDisplay } from "@/engine/store";
import { computeMerges, addrOf, colName, widthPx, isFormulaValue } from "@/lib/grid";
import type { RefTableRegion } from "@/lib/sheet-parser";

/** 数式セルの表示。未入力由来の 0（W×Hが空欄など）は薄く表示して判読しやすくする。 */
function RefFormulaCell({ sheet, addr }: { sheet: string; addr: string }) {
  const v = useDisplay(sheet, addr);
  const isZero = /^0(\.0+)?$/.test(v);
  return isZero ? <span className="muted-zero">{v}</span> : <>{v}</>;
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

  // 見出し行の固定: 行の実高さを測って top のオフセットを積み上げる。
  // 行高は内容依存のため描画後に計測し、再レンダーを避けて CSS 変数へ直接書く
  // （td 側は top: var(--sticky-top-N) を参照する）。
  const stickyCount = region.stickyHeaderRows ?? 0;
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!stickyCount || !scrollRef.current) return;
    let acc = 0;
    for (let i = 0; i < stickyCount; i++) {
      scrollRef.current.style.setProperty(`--sticky-top-${i}`, `${acc}px`);
      acc += rowRefs.current[i]?.offsetHeight ?? 0;
    }
  });

  return (
    <div className="reftable-scroll" ref={scrollRef}>
      <table className="reftable">
        <colgroup>
          {cols.map((c, idx) => (
            <col key={c} style={{ width: colWidth(c, idx) }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={r}
              ref={
                ri < stickyCount
                  ? (el) => {
                      rowRefs.current[ri] = el;
                    }
                  : undefined
              }
            >
              {cols.map((c) => {
                const key = `${r},${c}`;
                if (covered.has(key)) return null;
                const span = anchors.get(key);
                // 領域外へはみ出す結合は領域内にクランプ
                const cs = span ? Math.min(span.cs, region.toCol - c + 1) : 1;
                const rs = span ? Math.min(span.rs, region.toRow - r + 1) : 1;
                const addr = addrOf(r, c);
                const raw = model.data[r]?.[c];
                const isFormula = isFormulaValue(raw);
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
                  content = <RefFormulaCell sheet={sheet} addr={addr} />;
                } else if (raw !== null && raw !== undefined) {
                  content = String(raw);
                }
                return (
                  <td
                    key={c}
                    rowSpan={rs > 1 ? rs : undefined}
                    colSpan={cs > 1 ? cs : undefined}
                    className={"reftable-cell" + (isInput ? " is-input" : "")}
                    style={
                      ri < stickyCount
                        ? {
                            position: "sticky",
                            top: `var(--sticky-top-${ri}, 0px)`,
                            zIndex: 2,
                            background: "#fff", // 下の行が透けないよう不透明に
                          }
                        : undefined
                    }
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
