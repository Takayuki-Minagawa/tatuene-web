"use client";
/**
 * 画像レイヤ（DrawingEditor から抽出）。
 *  - ImageLayer: 画像本体 + 明るさフィルタ + 切り抜き clipPath（注釈の下に描画）
 *  - ImageHandles: 選択時のバウンディングボックス・拡縮/回転ハンドル（注釈の上）
 *  - CropOverlay: 切り抜き編集モードの暗転とハンドル（注釈の上）
 * html2canvas-pro はインラインSVGを丸ごと直列化してネイティブ描画するため、
 * 同一SVG内の defs（filter/clipPath）は PDF 出力でもそのまま反映される。
 */
import React from "react";
import { imageLocalToFrame, type FitRect, type Pt } from "@/drawings/geometry";
import type { ImageTransform } from "@/drawings/store";
import type { Corner, Tool } from "./types";
import type { ImageView } from "./view";

export function ImageLayer({
  slotId,
  imageDataUrl,
  fit,
  view,
  tool,
  editable,
  onImagePointerDown,
}: {
  slotId: string;
  imageDataUrl: string;
  fit: FitRect;
  view: ImageView;
  tool: Tool;
  editable: boolean;
  onImagePointerDown: (e: React.PointerEvent) => void;
}) {
  const { imgX, imgY, imgTransform, hasCrop, cropRect, brightness, opacity } = view;
  return (
    <g transform={imgTransform}>
      <defs>
        {brightness !== 1 && (
          <filter id={`br-${slotId}`}>
            <feComponentTransfer>
              <feFuncR type="linear" slope={brightness} />
              <feFuncG type="linear" slope={brightness} />
              <feFuncB type="linear" slope={brightness} />
            </feComponentTransfer>
          </filter>
        )}
        {hasCrop && (
          <clipPath id={`crop-${slotId}`}>
            <rect x={cropRect.x} y={cropRect.y} width={cropRect.w} height={cropRect.h} />
          </clipPath>
        )}
      </defs>
      {/* 切り抜き編集中は全体を見せるため clip を外す（外側は暗転表示） */}
      <g clipPath={hasCrop && tool !== "crop" ? `url(#crop-${slotId})` : undefined}>
        <image
          href={imageDataUrl}
          x={imgX}
          y={imgY}
          width={fit.w}
          height={fit.h}
          preserveAspectRatio="none"
          opacity={opacity}
          filter={brightness !== 1 ? `url(#br-${slotId})` : undefined}
          onPointerDown={onImagePointerDown}
          style={{ cursor: editable && tool === "select" ? "move" : "inherit", pointerEvents: editable ? "auto" : "none" }}
        />
      </g>
    </g>
  );
}

/** 画像選択時のバウンディングボックスと操作ハンドル（PDF側 editable=false では描画されない） */
export function ImageHandles({
  view,
  onScaleHandleDown,
  onRotateHandleDown,
}: {
  view: ImageView;
  onScaleHandleDown: (e: React.PointerEvent<SVGGElement>) => void;
  onRotateHandleDown: (e: React.PointerEvent) => void;
}) {
  const { tl, tr, br, bl, center } = view.corners;
  const topMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const len = Math.hypot(topMid.x - center.x, topMid.y - center.y) || 1;
  const rot = {
    x: topMid.x + ((topMid.x - center.x) / len) * 24,
    y: topMid.y + ((topMid.y - center.y) / len) * 24,
  };
  const handles: [Corner, Pt, string][] = [
    ["tl", tl, "nwse-resize"],
    ["tr", tr, "nesw-resize"],
    ["br", br, "nwse-resize"],
    ["bl", bl, "nesw-resize"],
  ];
  return (
    <g>
      <polygon
        points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
        fill="none"
        stroke="#0a84ff"
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ pointerEvents: "none" }}
      />
      <line x1={topMid.x} y1={topMid.y} x2={rot.x} y2={rot.y} stroke="#0a84ff" strokeWidth={1} style={{ pointerEvents: "none" }} />
      {handles.map(([k, pt, cursor]) => (
        <g key={k} data-handle={k} onPointerDown={onScaleHandleDown} style={{ cursor }}>
          {/* タッチ向けの広い当たり判定 */}
          <rect x={pt.x - 12} y={pt.y - 12} width={24} height={24} fill="transparent" />
          <rect x={pt.x - 5} y={pt.y - 5} width={10} height={10} fill="#fff" stroke="#0a84ff" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        </g>
      ))}
      <g onPointerDown={onRotateHandleDown} style={{ cursor: "grab" }}>
        <circle cx={rot.x} cy={rot.y} r={12} fill="transparent" />
        <circle cx={rot.x} cy={rot.y} r={5} fill="#fff" stroke="#0a84ff" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
      </g>
    </g>
  );
}

/** 切り抜き編集オーバーレイ（crop ツール時のみ） */
export function CropOverlay({
  fit,
  t,
  view,
  onCropHandleDown,
}: {
  fit: FitRect;
  t: ImageTransform;
  view: ImageView;
  onCropHandleDown: (e: React.PointerEvent<SVGGElement>) => void;
}) {
  const { imgX, imgY, imgTransform, cropRect: cr } = view;
  const right = imgX + fit.w,
    bottom = imgY + fit.h;
  const dim = "rgba(0,0,0,0.45)";
  const handlePts: [Corner, Pt][] = [
    ["tl", { x: cr.x, y: cr.y }],
    ["tr", { x: cr.x + cr.w, y: cr.y }],
    ["br", { x: cr.x + cr.w, y: cr.y + cr.h }],
    ["bl", { x: cr.x, y: cr.y + cr.h }],
  ];
  return (
    <g>
      {/* 暗転と枠線は画像と一緒に回転・拡縮させる */}
      <g transform={imgTransform} style={{ pointerEvents: "none" }}>
        <rect x={imgX} y={imgY} width={fit.w} height={Math.max(0, cr.y - imgY)} fill={dim} />
        <rect x={imgX} y={cr.y} width={Math.max(0, cr.x - imgX)} height={cr.h} fill={dim} />
        <rect x={cr.x + cr.w} y={cr.y} width={Math.max(0, right - cr.x - cr.w)} height={cr.h} fill={dim} />
        <rect x={imgX} y={cr.y + cr.h} width={fit.w} height={Math.max(0, bottom - cr.y - cr.h)} fill={dim} />
        <rect x={cr.x} y={cr.y} width={cr.w} height={cr.h} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="6 4" />
      </g>
      {/* ハンドルは画面上で一定サイズになるようフレーム座標へ写像して描く */}
      {handlePts.map(([k, pt]) => {
        const fp = imageLocalToFrame(pt, fit, t);
        return (
          <g key={k} data-handle={k} onPointerDown={onCropHandleDown} style={{ cursor: "crosshair" }}>
            <rect x={fp.x - 12} y={fp.y - 12} width={24} height={24} fill="transparent" />
            <rect x={fp.x - 5} y={fp.y - 5} width={10} height={10} fill="#fff" stroke="#e65100" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
          </g>
        );
      })}
    </g>
  );
}
