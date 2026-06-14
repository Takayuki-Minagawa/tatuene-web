"use client";
/**
 * シート上の絶対配置オーバーレイ（説明用挿絵・図面配置枠）。SheetGrid から抽出。
 * 座標は SheetGrid が計算した列・行の累積px（colLeft/rowTop）を共有する。
 */
import React from "react";
import type { DrawingSlot, ImageAnchor } from "@/engine/workbook";
import DrawingEditor from "./DrawingEditor";
import { PLAN_COPY_SLOT_IDS, PLAN_AUTHOR_W, PLAN_AUTHOR_H } from "@/drawings/planFrame";

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

        // 間取り図のコピー枠（現状図/改修図）: 計算シートの作図（基準 W×H）を、
        // セル枠の高さに合わせて一括縮小し読み取り専用で焼き込む。基準は A4縦比
        // なので縦長のセル枠へ等倍で収まり、画像・注釈とも寸分違わぬコピーになる。
        // 編集は計算シートの「間取り図」側で行う。
        if (PLAN_COPY_SLOT_IDS.has(slot.id)) {
          // height はシート表示倍率(scale)反映済みなので、コピーもズームに追従する。
          const s = height / PLAN_AUTHOR_H;
          const width = PLAN_AUTHOR_W * s;
          return (
            <div
              key={slot.id}
              style={{ position: "absolute", left, top, width, height, overflow: "hidden" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: PLAN_AUTHOR_W,
                  height: PLAN_AUTHOR_H,
                  transform: `scale(${s})`,
                  transformOrigin: "top left",
                }}
              >
                <DrawingEditor slot={slot} width={PLAN_AUTHOR_W} height={PLAN_AUTHOR_H} editable={false} />
              </div>
            </div>
          );
        }

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
