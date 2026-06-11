"use client";
/**
 * 図面編集ツールバー（DrawingEditor から抽出）。
 * ストアのミューテータは直接 import して呼ぶ（snapshot で Undo 単位を確定）。
 */
import React from "react";
import type { DrawingSlot } from "@/engine/workbook";
import {
  setTransform,
  removeAnnotation,
  clearSlot,
  snapshot,
  undo,
  redo,
  canUndo,
  canRedo,
  type ImageTransform,
} from "@/drawings/store";
import { COLORS, IMAGE_SELECTION, type Tool } from "./types";

export default function DrawingToolbar({
  slot,
  tool,
  setTool,
  color,
  setColor,
  lineWidth,
  setLineWidth,
  selected,
  setSelected,
  hasImage,
  t,
  onUpload,
  onFinishCrop,
}: {
  slot: DrawingSlot;
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  lineWidth: number;
  setLineWidth: (w: number) => void;
  selected: string | null;
  setSelected: (s: string | null) => void;
  hasImage: boolean;
  t: ImageTransform;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFinishCrop: () => void;
}) {
  return (
    <div className="draw-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="draw-label">{slot.label}</span>
      <label className="draw-btn">
        画像
        <input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
      </label>
      {([
        ["select", "選択"],
        ["line", "直線"],
        ["arrow", "矢印"],
        ["number", "丸数字"],
        ["text", "文字"],
      ] as [Tool, string][]).map(([k, lbl]) => (
        <button key={k} className={"draw-btn" + (tool === k ? " on" : "")} onClick={() => setTool(k)}>
          {lbl}
        </button>
      ))}
      <span className="draw-colors">
        {COLORS.map((c) => (
          <button key={c} className={"draw-color" + (color === c ? " on" : "")} style={{ background: c }} onClick={() => setColor(c)} aria-label={`色 ${c}`} />
        ))}
      </span>
      <label className="draw-range" title="線の太さ">
        太
        <input type="range" min={1} max={8} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
      </label>
      <button className="draw-btn" title="元に戻す (Ctrl+Z)" disabled={!canUndo()} onClick={undo}>
        戻す
      </button>
      <button className="draw-btn" title="やり直す (Ctrl+Shift+Z / Ctrl+Y)" disabled={!canRedo()} onClick={redo}>
        進む
      </button>
      {hasImage && tool !== "crop" && (
        <>
          <button
            className="draw-btn"
            title="画像の位置・拡大率・回転を初期状態に戻す"
            onClick={() => {
              snapshot(slot.id);
              setTransform(slot.id, { x: 0, y: 0, scale: 1, rotation: 0 });
            }}
          >
            フィット
          </button>
          <button
            className={"draw-btn" + (t.flipH ? " on" : "")}
            title="左右反転"
            onClick={() => {
              snapshot(slot.id);
              setTransform(slot.id, { flipH: !t.flipH || undefined });
            }}
          >
            ⇄
          </button>
          <button
            className={"draw-btn" + (t.flipV ? " on" : "")}
            title="上下反転"
            onClick={() => {
              snapshot(slot.id);
              setTransform(slot.id, { flipV: !t.flipV || undefined });
            }}
          >
            ⇅
          </button>
          <label className="draw-range" title="透明度">
            透
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={t.opacity ?? 1}
              onPointerDown={() => snapshot(slot.id)}
              onChange={(e) => setTransform(slot.id, { opacity: Number(e.target.value) })}
            />
          </label>
          <label className="draw-range" title="明るさ（薄いスキャンの補正など）">
            明
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={t.brightness ?? 1}
              onPointerDown={() => snapshot(slot.id)}
              onChange={(e) => setTransform(slot.id, { brightness: Number(e.target.value) })}
            />
          </label>
          <button className="draw-btn" title="画像の表示範囲を切り抜く" onClick={() => setTool("crop")}>
            切抜
          </button>
        </>
      )}
      {hasImage && tool === "crop" && (
        <>
          <button className="draw-btn on" title="切り抜きを確定" onClick={onFinishCrop}>
            確定
          </button>
          <button
            className="draw-btn warn"
            title="切り抜きを解除"
            onClick={() => {
              snapshot(slot.id);
              setTransform(slot.id, { crop: undefined });
              setTool("select");
            }}
          >
            解除
          </button>
        </>
      )}
      {selected && selected !== IMAGE_SELECTION && (
        <button
          className="draw-btn warn"
          onClick={() => {
            removeAnnotation(slot.id, selected);
            setSelected(null);
          }}
        >
          注釈削除
        </button>
      )}
      <button
        className="draw-btn warn"
        onClick={() => {
          if (confirm(`「${slot.label}」の図面と注釈をすべて削除します。よろしいですか？`)) {
            clearSlot(slot.id);
            setSelected(null);
          }
        }}
      >
        図面削除
      </button>
    </div>
  );
}
