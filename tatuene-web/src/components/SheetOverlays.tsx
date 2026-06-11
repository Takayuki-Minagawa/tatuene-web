"use client";
/**
 * シート上の絶対配置オーバーレイ（説明用挿絵・図面配置枠）。SheetGrid から抽出。
 * 座標は SheetGrid が計算した列・行の累積px（colLeft/rowTop）を共有する。
 */
import React from "react";
import type { DrawingSlot, ImageAnchor } from "@/engine/workbook";
import DrawingEditor from "./DrawingEditor";

const EMU = 9525; // 1px = 9525 EMU

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
    </>
  );
}
