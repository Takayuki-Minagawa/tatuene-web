"use client";
/**
 * Excel風グリッドフォーム。1シートを表形式で描画する。
 *  - 数式セル: 計算結果を表示（読み取り専用・薄青）
 *  - 入力セル(locked=False): 編集可能。建材セルはドロップダウン
 *  - ラベル/固定セル: テキスト表示
 * 結合セル・配置・太字・表示形式は Excel から抽出した情報を反映。
 */
import React from "react";
import { engine, useEngineVersion } from "@/engine/store";
import type { SheetModel } from "@/engine/workbook";
import { colName, addrOf, widthPx, computeMerges, asTextAlign } from "@/lib/grid";
import CellInput from "./CellInput";
import SheetOverlays from "./SheetOverlays";
import {
  DEFAULT_VERSION_SETTINGS,
  coverVersionLabel,
  type VersionSettings,
} from "@/lib/version";

const BORDER = "1px solid #9aa0a6";

// 見出し固定の対象行（0始まりインデックス）。スクロールしても画面上部に貼り付く。
// 列見出しが中段にある表のみ設定（先頭からの連続行でなくてよい）。
const STICKY_HEADER_ROWS: Record<string, number[]> = {
  部材性能シート: [9, 10], // 「建材／熱抵抗値…」と単位の2行
};

export default function SheetGrid({
  sheetName,
  model,
  faithful = false,
  scale = 1,
  interactiveDrawings = false,
  versionSettings = DEFAULT_VERSION_SETTINGS,
  inputOnly = false,
}: {
  sheetName: string;
  model: SheetModel;
  faithful?: boolean; // true: Excel忠実(罫線・塗りそのまま・計算セルも素の見た目)
  scale?: number;
  interactiveDrawings?: boolean; // true: 図面枠を編集可能に（false=帳票焼き込み）
  versionSettings?: VersionSettings;
  inputOnly?: boolean; // true: 入力欄を含む行だけに絞ってコンパクト表示
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

  // 入力モード: 入力欄を含む行だけ表示（図面ありシートは対象外）。結合は無効化して
  // 隠れた行をまたぐ結合の崩れを防ぐ。
  const useInputOnly = inputOnly && !hasOverlays;
  const inputRowSet = useInputOnly
    ? new Set(model.inputs.map((i) => i.row))
    : null;

  // 見出し固定: 対象行の上端オフセットを積み上げて算出（図面あり・入力モードでは無効）
  const stickyRows = hasOverlays || useInputOnly ? [] : STICKY_HEADER_ROWS[sheetName] ?? [];
  const stickyTop = new Map<number, number>();
  {
    let acc = 0;
    for (const r of [...stickyRows].sort((a, b) => a - b)) {
      stickyTop.set(r, acc);
      acc += rowPx[r] ?? 0;
    }
  }

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
          {Array.from({ length: model.maxRow }, (_, r) => {
            if (inputRowSet && !inputRowSet.has(r)) return null;
            return (
            <tr key={r} style={hasOverlays ? { height: rowPx[r] } : undefined}>
              {Array.from({ length: model.maxCol }, (_, c) => {
                const key = `${r},${c}`;
                if (!useInputOnly && covered.has(key)) return null;
                const span = useInputOnly ? undefined : anchors.get(key);
                const addr = addrOf(r, c);
                const sid = model.styles[r]?.[c] ?? -1;
                const st = sid >= 0 ? model.styleTable[sid] : null;
                const raw = model.data[r]?.[c];
                const isFormula = typeof raw === "string" && raw.startsWith("=");
                const isInput = inputSet.has(addr) && !isFormula;
                const isDropdown = dropdownSet.has(addr);
                const align = asTextAlign(st?.h, typeof raw === "number" ? "right" : "left");

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
                } else if (sheetName === "表紙" && addr === "B18") {
                  content = coverVersionLabel(versionSettings);
                } else if (raw !== null && raw !== undefined) {
                  content = String(raw);
                }

                const fontPx = Math.max(8, Math.round((st?.sz ?? 11) * 1.15 * scale));
                const isSticky = stickyTop.has(r);

                return (
                  <td
                    key={c}
                    rowSpan={span?.rs}
                    colSpan={span?.cs}
                    className="xl-cell"
                    style={{
                      textAlign: align,
                      fontWeight: st?.b ? 700 : undefined,
                      fontSize: `${fontPx}px`,
                      whiteSpace: st?.wrap ? "normal" : "nowrap",
                      verticalAlign: st?.v === "center" ? "middle" : "middle",
                      background: bg,
                      color: !faithful && isFormula ? "#14418a" : st?.color || undefined,
                      padding: isInput ? 0 : "1px 3px",
                      ...borderStyle,
                      ...(isSticky
                        ? {
                            position: "sticky",
                            top: stickyTop.get(r),
                            zIndex: 3,
                            background: bg || "#fff", // 下の内容が透けないよう不透明に
                          }
                        : null),
                    }}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
      {hasOverlays && (
        <SheetOverlays
          images={images}
          slots={slots}
          colLeft={colLeft}
          rowTop={rowTop}
          scale={scale}
          interactiveDrawings={interactiveDrawings}
        />
      )}
      </div>
    </div>
  );
}
