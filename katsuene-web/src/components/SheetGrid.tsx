"use client";
/**
 * Excel風グリッドフォーム。1シートを表形式で描画する。
 *  - 数式セル: 計算結果を表示（読み取り専用・薄青）
 *  - 入力セル(locked=False): 編集可能。建材セルはドロップダウン
 *  - ラベル/固定セル: テキスト表示
 * 結合セル・配置・太字・表示形式は Excel から抽出した情報を反映。
 */
import React, { useEffect, useRef, useState } from "react";
import { engine, setInput, useEngineVersion } from "@/engine/store";
import type { SheetModel } from "@/engine/workbook";
import { a1ToRC } from "@/engine/workbook";
import master from "@/data/material-master.json";
import DrawingEditor from "./DrawingEditor";

const MATERIALS: string[] = (master as any).materials.map((m: any) => m.name);

function colName(c: number): string {
  let s = "";
  c += 1;
  while (c > 0) {
    s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}
const addrOf = (r: number, c: number) => `${colName(c)}${r + 1}`;

// Excel列幅 → px（概算）
function widthPx(w: number | undefined): number {
  if (!w) return 60;
  return Math.round(w * 7 + 5);
}

interface MergeInfo {
  anchors: Map<string, { rs: number; cs: number }>;
  covered: Set<string>;
}
function computeMerges(merges: string[]): MergeInfo {
  const anchors = new Map<string, { rs: number; cs: number }>();
  const covered = new Set<string>();
  for (const m of merges) {
    const [a, b] = m.split(":");
    if (!b) continue;
    const p1 = a1ToRC(a);
    const p2 = a1ToRC(b);
    const r1 = Math.min(p1.row, p2.row), r2 = Math.max(p1.row, p2.row);
    const c1 = Math.min(p1.col, p2.col), c2 = Math.max(p1.col, p2.col);
    anchors.set(`${r1},${c1}`, { rs: r2 - r1 + 1, cs: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        if (!(r === r1 && c === c1)) covered.add(`${r},${c}`);
  }
  return { anchors, covered };
}

/** 編集可能セル（入力 / 建材ドロップダウン / 通気層） */
function CellInput({
  sheet,
  addr,
  isDropdown,
  align,
}: {
  sheet: string;
  addr: string;
  isDropdown: boolean;
  align: string;
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
        {!MATERIALS.includes(engineStr) && engineStr !== "" && (
          <option value={engineStr}>{engineStr}</option>
        )}
        {MATERIALS.map((m) => (
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
      style={{ textAlign: (align as any) || "left" }}
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

const BORDER = "1px solid #9aa0a6";

export default function SheetGrid({
  sheetName,
  model,
  faithful = false,
  scale = 1,
  interactiveDrawings = false,
}: {
  sheetName: string;
  model: SheetModel;
  faithful?: boolean; // true: Excel忠実(罫線・塗りそのまま・計算セルも素の見た目)
  scale?: number;
  interactiveDrawings?: boolean; // true: 図面枠を編集可能に（false=帳票焼き込み）
}) {
  useEngineVersion(); // 計算セルの再描画購読
  const eng = engine();
  const { anchors, covered } = computeMerges(model.merges);
  const inputSet = new Set(model.inputs.map((i) => i.addr));
  const dropdownSet = new Set(model.dropdownCells);

  const colPx: number[] = [];
  for (let c = 0; c < model.maxCol; c++)
    colPx.push(Math.round(widthPx(model.colWidths[colName(c)]) * scale));

  // 画像（説明用挿絵）・図面枠の配置計算
  const images = model.images ?? [];
  const slots = model.drawingSlots ?? [];
  const hasImages = images.length > 0;
  const hasOverlays = hasImages || slots.length > 0;
  const EMU = 9525; // 1px = 9525 EMU
  const defRow = Math.round((model.defaultRowHeight ?? 15) * (4 / 3) * scale);
  const rowPx: number[] = [];
  for (let r = 0; r < model.maxRow; r++) {
    const h = model.rowHeights[(r + 1).toString()];
    rowPx.push(h ? Math.round(h * (4 / 3) * scale) : defRow);
  }
  const colLeft = [0];
  for (let c = 0; c < model.maxCol; c++) colLeft.push(colLeft[c] + colPx[c]);
  const rowTop = [0];
  for (let r = 0; r < model.maxRow; r++) rowTop.push(rowTop[r] + rowPx[r]);
  const emuPx = (e: number) => (e / EMU) * scale;

  return (
    <div className="grid-scroll">
      <div style={{ position: "relative", width: "max-content" }}>
      <table
        className={"xl-grid" + (faithful ? " faithful" : "") + (hasOverlays ? " with-images" : "")}
        style={{ width: "max-content" }}
      >
        <colgroup>
          {colPx.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {Array.from({ length: model.maxRow }, (_, r) => (
            <tr key={r} style={hasOverlays ? { height: rowPx[r] } : undefined}>
              {Array.from({ length: model.maxCol }, (_, c) => {
                const key = `${r},${c}`;
                if (covered.has(key)) return null;
                const span = anchors.get(key);
                const addr = addrOf(r, c);
                const sid = model.styles[r]?.[c] ?? -1;
                const st = sid >= 0 ? model.styleTable[sid] : null;
                const raw = model.data[r]?.[c];
                const isFormula = typeof raw === "string" && raw.startsWith("=");
                const isInput = inputSet.has(addr) && !isFormula;
                const isDropdown = dropdownSet.has(addr);
                const align = st?.h || (typeof raw === "number" ? "right" : "left");

                // 背景色
                let bg: string | undefined = st?.fill || undefined;
                if (!faithful) {
                  if (isFormula) bg = "var(--formula)";
                  else if (isInput) bg = undefined;
                }

                // Excelの罫線
                const bd = st?.bd;
                const borderStyle: React.CSSProperties = bd
                  ? {
                      borderLeft: bd[0] ? BORDER : undefined,
                      borderRight: bd[1] ? BORDER : undefined,
                      borderTop: bd[2] ? BORDER : undefined,
                      borderBottom: bd[3] ? BORDER : undefined,
                    }
                  : {};

                let content: React.ReactNode = null;
                if (isInput) {
                  content = (
                    <CellInput sheet={sheetName} addr={addr} isDropdown={isDropdown} align={align} />
                  );
                } else if (isFormula) {
                  content = eng.getDisplay(sheetName, addr);
                } else if (raw !== null && raw !== undefined) {
                  content = String(raw);
                }

                const fontPx = Math.max(8, Math.round((st?.sz ?? 11) * 1.15 * scale));

                return (
                  <td
                    key={c}
                    rowSpan={span?.rs}
                    colSpan={span?.cs}
                    className="xl-cell"
                    style={{
                      textAlign: align as any,
                      fontWeight: st?.b ? 700 : undefined,
                      fontSize: `${fontPx}px`,
                      whiteSpace: st?.wrap ? "normal" : "nowrap",
                      verticalAlign: st?.v === "center" ? "middle" : "middle",
                      background: bg,
                      color: !faithful && isFormula ? "#14418a" : st?.color || undefined,
                      padding: isInput ? 0 : "1px 3px",
                      ...borderStyle,
                    }}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hasImages &&
        images.map((im, i) => {
          const left = colLeft[im.fromCol] + emuPx(im.fromColOff);
          const top = rowTop[im.fromRow] + emuPx(im.fromRowOff);
          const right = colLeft[im.toCol] + emuPx(im.toColOff);
          const bottom = rowTop[im.toRow] + emuPx(im.toRowOff);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`/assets/${im.file}`}
              alt=""
              aria-hidden
              style={{
                position: "absolute",
                left,
                top,
                width: Math.max(1, right - left),
                height: Math.max(1, bottom - top),
                pointerEvents: "none",
                objectFit: "fill",
              }}
            />
          );
        })}
      {slots.map((slot) => {
        const left = colLeft[slot.fromCol] + emuPx(slot.fromColOff);
        const top = rowTop[slot.fromRow] + emuPx(slot.fromRowOff);
        const right = colLeft[slot.toCol] + emuPx(slot.toColOff);
        const bottom = rowTop[slot.toRow] + emuPx(slot.toRowOff);
        return (
          <div key={slot.id} style={{ position: "absolute", left, top }}>
            <DrawingEditor
              slot={slot}
              width={Math.max(1, right - left)}
              height={Math.max(1, bottom - top)}
              editable={interactiveDrawings}
            />
          </div>
        );
      })}
      </div>
    </div>
  );
}
