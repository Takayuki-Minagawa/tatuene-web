"use client";
/**
 * 図面配置枠の編集器（1枠）。SVGで画像＋注釈を描画する。
 *  - editable=true（評価シート画面）: アップロード（選択/D&D/貼り付け）/移動/拡大縮小/回転/
 *    反転/透明度/明るさ/切り抜き/直線・矢印・丸数字・テキスト/Undo・Redo/削除
 *  - editable=false（PDF帳票・ReportFrame）: 画像と注釈を焼き込み表示（操作不可）
 *
 * 座標系は枠の「scale=1 px箱」ローカル座標。画面・PDFとも scale=1 描画なので保存値で再現可能。
 * 実装は components/drawing/ 配下に分割（ジェスチャ・レイヤ・ツールバー）。
 */
import React, { useRef, useState } from "react";
import type { DrawingSlot } from "@/engine/workbook";
import { importImageBlob, pickImageFile } from "@/drawings/importImage";
import { fitContain } from "@/drawings/geometry";
import {
  useDrawingsVersion,
  getSlot,
  setImage,
  setTransform,
  updateAnnotation,
  removeAnnotation,
  snapshot,
  undo,
  redo,
  type Annotation,
} from "@/drawings/store";
import { IMAGE_SELECTION, type Tool, COLORS } from "./drawing/types";
import { computeImageView } from "./drawing/view";
import { useDrawingGestures } from "./drawing/useDrawingGestures";
import AnnotationLayer from "./drawing/AnnotationLayer";
import { ImageLayer, ImageHandles, CropOverlay } from "./drawing/ImageLayer";
import DrawingToolbar from "./drawing/DrawingToolbar";

export default function DrawingEditor({
  slot,
  width,
  height,
  editable,
}: {
  slot: DrawingSlot;
  width: number;
  height: number;
  editable: boolean;
}) {
  useDrawingsVersion();
  const state = getSlot(slot.id);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fit = fitContain(state.natW ?? 0, state.natH ?? 0, width, height);
  const t = state.transform;
  const view = computeImageView(fit, t);
  const hasImage = !!state.imageDataUrl;

  const g = useDrawingGestures({
    slotId: slot.id,
    editable,
    tool,
    color,
    lineWidth,
    fit,
    t,
    view,
    svgRef,
    setSelected,
  });

  // ---- 画像取り込み（ファイル選択 / D&D / 貼り付けの共通入口） ----
  async function acceptImage(file: Blob, name: string, confirmReplace: boolean) {
    if (confirmReplace && state.imageDataUrl && !confirm(`「${slot.label}」の画像を置き換えます。よろしいですか？`)) return;
    try {
      const data = await importImageBlob(file, name);
      setImage(slot.id, data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "画像を読み込めませんでした");
    }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void acceptImage(f, f.name, false);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    if (!editable) return;
    e.preventDefault();
    setDragOver(false);
    const f = pickImageFile(e.dataTransfer.items) ?? Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    if (f) void acceptImage(f, f.name, true);
  }

  function onPaste(e: React.ClipboardEvent) {
    if (!editable) return;
    const f = pickImageFile(e.clipboardData?.items);
    if (!f) return;
    e.preventDefault();
    void acceptImage(f, f.name || "クリップボード画像", true);
  }

  /** 切り抜きモードを終了。ほぼ全面のままなら crop なし扱いに戻す。 */
  function finishCrop() {
    const c = t.crop;
    if (c && c.x < 0.005 && c.y < 0.005 && c.w > 0.99 && c.h > 0.99) {
      setTransform(slot.id, { crop: undefined });
    }
    setTool("select");
  }

  function editText(ann: Extract<Annotation, { type: "text" }>) {
    const txt = window.prompt("テキストを編集", ann.text);
    if (txt !== null && txt !== ann.text) {
      snapshot(slot.id);
      updateAnnotation(slot.id, ann.id, { text: txt } as Partial<Annotation>);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!editable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (selected === IMAGE_SELECTION && hasImage) {
      // 画像選択中: 矢印キーで微調整（Shiftで10px）。削除は「図面削除」ボタンに限定。
      const step = e.shiftKey ? 10 : 1;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const m = move[e.key];
      if (m) {
        e.preventDefault();
        snapshot(slot.id);
        setTransform(slot.id, { x: t.x + m[0], y: t.y + m[1] });
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      removeAnnotation(slot.id, selected);
      setSelected(null);
    }
  }

  return (
    <div
      style={{ position: "absolute", left: 0, top: 0, width, height }}
      onPaste={onPaste}
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* ツールバー（編集時のみ・枠の上に表示） */}
      {editable && (
        <DrawingToolbar
          slot={slot}
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          lineWidth={lineWidth}
          setLineWidth={setLineWidth}
          selected={selected}
          setSelected={setSelected}
          hasImage={hasImage}
          t={t}
          onUpload={onUpload}
          onFinishCrop={finishCrop}
        />
      )}

      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        tabIndex={editable ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerDown={g.onSvgPointerDown}
        onPointerMove={g.onSvgPointerMove}
        onPointerUp={g.onSvgPointerUp}
        onPointerCancel={g.cancelDrag}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: editable ? "auto" : "none",
          outline: dragOver ? "2px dashed #0a84ff" : editable ? "1px dashed #b7c4de" : "none",
          background: dragOver ? "rgba(10,132,255,0.08)" : editable && !hasImage ? "rgba(183,196,222,0.06)" : "transparent",
          touchAction: "none",
          cursor: tool === "select" ? "default" : "crosshair",
        }}
      >
        {/* 不透明な「用紙」背景。これがないと透明SVG越しに下のグリッド表が透け、
            図の挿入・編集が見えにくい。編集枠・評価シートのコピー・PDFすべてに効く。 */}
        <rect x={0} y={0} width={width} height={height} fill="#ffffff" style={{ pointerEvents: "none" }} />
        {hasImage && state.imageDataUrl && (
          <ImageLayer
            slotId={slot.id}
            imageDataUrl={state.imageDataUrl}
            fit={fit}
            view={view}
            tool={tool}
            editable={editable}
            onImagePointerDown={g.onImagePointerDown}
          />
        )}
        <AnnotationLayer
          annotations={state.annotations}
          draft={g.draft}
          selected={selected}
          editable={editable}
          onAnnPointerDown={g.onAnnPointerDown}
          onEditText={editText}
        />
        {editable && hasImage && selected === IMAGE_SELECTION && tool !== "crop" && (
          <ImageHandles view={view} onScaleHandleDown={g.onScaleHandleDown} onRotateHandleDown={g.onRotateHandleDown} />
        )}
        {editable && hasImage && tool === "crop" && (
          <CropOverlay fit={fit} t={t} view={view} onCropHandleDown={g.onCropHandleDown} />
        )}
        {editable && !hasImage && (
          <>
            <text x={width / 2} y={height / 2 - 10} textAnchor="middle" dominantBaseline="central" fill="#9aa6bd" fontSize={13} style={{ pointerEvents: "none", userSelect: "none" }}>
              「画像」ボタン / ドラッグ&ドロップ
            </text>
            <text x={width / 2} y={height / 2 + 10} textAnchor="middle" dominantBaseline="central" fill="#9aa6bd" fontSize={13} style={{ pointerEvents: "none", userSelect: "none" }}>
              枠をクリックして Ctrl+V で貼り付け
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
