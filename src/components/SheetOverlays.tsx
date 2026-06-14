"use client";
/**
 * シート上の絶対配置オーバーレイ（説明用挿絵・図面配置枠）。SheetGrid から抽出。
 * 座標は SheetGrid が計算した列・行の累積px（colLeft/rowTop）を共有する。
 */
import React from "react";
import type { DrawingSlot, ImageAnchor } from "@/engine/workbook";
import DrawingEditor from "./DrawingEditor";

const EMU = 9525; // 1px = 9525 EMU

// 図面枠の縦長化（A4縦寄り）。元のExcel枠は極端な横長(約5:1)で図面を貼りにくいため、
// 高さ(行11ラベル〜行27表の手前で固定)はそのままに、幅だけを「高さ ÷ 比率」へ絞る。
// 上下は触らないので他セル・隣の枠と干渉しない。比率を変えたいときはここを調整。
const PORTRAIT_SLOT_IDS = new Set(["slot1", "slot2"]); // 現状図・改修図
const PORTRAIT_RATIO = 1.4; // 高さ ÷ 幅（≒A4縦の縦横比）

export default function SheetOverlays({
  images,
  slots,
  colLeft,
  rowTop,
  scale,
  interactiveDrawings,
}: {
  images: ImageAnchor[];
  slots: DrawingSlot[];
  colLeft: number[];
  rowTop: number[];
  scale: number;
  interactiveDrawings: boolean;
}) {
  const emuPx = (e: number) => (e / EMU) * scale;
  return (
    <>
      {images.map((im, i) => {
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
        const height = Math.max(1, bottom - top);
        // 縦長化対象は幅を絞る。それ以外は元の枠幅のまま。
        const width = PORTRAIT_SLOT_IDS.has(slot.id)
          ? height / PORTRAIT_RATIO
          : Math.max(1, right - left);
        return (
          <div key={slot.id} style={{ position: "absolute", left, top }}>
            <DrawingEditor
              slot={slot}
              width={width}
              height={height}
              editable={interactiveDrawings}
            />
          </div>
        );
      })}
    </>
  );
}
