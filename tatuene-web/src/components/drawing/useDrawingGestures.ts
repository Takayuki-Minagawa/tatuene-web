"use client";
/**
 * 図面編集のポインタジェスチャ状態機械（DrawingEditor から抽出）。
 * ポインタキャプチャは常に SVG 要素に一本化し、move/up は単一ディスパッチで処理する。
 * 各ジェスチャ開始時に snapshot() を1回呼ぶことで Undo が操作単位になる。
 */
import React, { useRef, useState } from "react";
import {
  scaleFromHandleDrag,
  rotationFromHandleDrag,
  frameToImageLocal,
  cropFromHandleDrag,
  type FitRect,
  type Pt,
} from "@/drawings/geometry";
import {
  setTransform,
  addAnnotation,
  updateAnnotation,
  nextId,
  nextNumber,
  snapshot,
  type Annotation,
  type ImageTransform,
} from "@/drawings/store";
import { IMAGE_SELECTION, type Corner, type Tool } from "./types";
import type { ImageView } from "./view";

export interface DrawingGestures {
  draft: Annotation | null;
  onSvgPointerDown: (e: React.PointerEvent) => void;
  onSvgPointerMove: (e: React.PointerEvent) => void;
  onSvgPointerUp: (e: React.PointerEvent) => void;
  cancelDrag: () => void;
  onImagePointerDown: (e: React.PointerEvent) => void;
  onScaleHandleDown: (e: React.PointerEvent<SVGGElement>) => void;
  onRotateHandleDown: (e: React.PointerEvent) => void;
  onCropHandleDown: (e: React.PointerEvent<SVGGElement>) => void;
  onAnnPointerDown: (e: React.PointerEvent, ann: Annotation) => void;
}

export function useDrawingGestures({
  slotId,
  editable,
  tool,
  color,
  lineWidth,
  fit,
  t,
  view,
  svgRef,
  setSelected,
}: {
  slotId: string;
  editable: boolean;
  tool: Tool;
  color: string;
  lineWidth: number;
  fit: FitRect;
  t: ImageTransform;
  view: ImageView;
  svgRef: React.RefObject<SVGSVGElement | null>;
  setSelected: (s: string | null) => void;
}): DrawingGestures {
  const [draft, setDraft] = useState<Annotation | null>(null);
  const drag = useRef<
    | null
    | { mode: "image"; sx: number; sy: number; ox: number; oy: number }
    | { mode: "ann"; id: string; sx: number; sy: number; orig: Annotation }
    | { mode: "draw"; sx: number; sy: number }
    | { mode: "img-scale"; handle: Corner; startPt: Pt; startScale: number; center: Pt }
    | { mode: "img-rotate"; startPt: Pt; startRotation: number; center: Pt }
    | { mode: "crop"; handle: Corner }
  >(null);

  function toLocal(e: React.PointerEvent): Pt {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function onSvgPointerDown(e: React.PointerEvent) {
    if (!editable) return;
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (tool === "line" || tool === "arrow") {
      drag.current = { mode: "draw", sx: p.x, sy: p.y };
      setDraft({ id: "draft", type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: lineWidth });
    } else if (tool === "number") {
      addAnnotation(slotId, { id: nextId(), type: "number", x: p.x, y: p.y, value: nextNumber(slotId), color, size: 18 });
    } else if (tool === "text") {
      const txt = window.prompt("テキストを入力", "");
      if (txt) addAnnotation(slotId, { id: nextId(), type: "text", x: p.x, y: p.y, text: txt, color, size: 16 });
    } else if (tool === "select") {
      // 選択ツール: 空白クリックで選択解除（図形は各自stopPropagation）
      setSelected(null);
    }
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const p = toLocal(e);
    const d = drag.current;
    if (d.mode === "draw") {
      setDraft((cur) => (cur && (cur.type === "line" || cur.type === "arrow") ? { ...cur, x2: p.x, y2: p.y } : cur));
    } else if (d.mode === "image") {
      setTransform(slotId, { x: d.ox + (p.x - d.sx), y: d.oy + (p.y - d.sy) });
    } else if (d.mode === "img-scale") {
      setTransform(slotId, { scale: scaleFromHandleDrag(d.center, d.startPt, p, d.startScale) });
    } else if (d.mode === "img-rotate") {
      setTransform(slotId, { rotation: rotationFromHandleDrag(d.center, d.startPt, p, d.startRotation, e.shiftKey) });
    } else if (d.mode === "crop") {
      const local = frameToImageLocal(p, fit, t);
      setTransform(slotId, { crop: cropFromHandleDrag(view.crop, d.handle, local, fit, t) });
    } else if (d.mode === "ann") {
      const dx = p.x - d.sx,
        dy = p.y - d.sy;
      const o = d.orig;
      switch (o.type) {
        case "line":
        case "arrow":
          updateAnnotation(slotId, d.id, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
          break;
        default:
          updateAnnotation(slotId, d.id, { x: o.x + dx, y: o.y + dy });
      }
    }
  }

  function onSvgPointerUp(e: React.PointerEvent) {
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.mode === "draw" && draft && (draft.type === "line" || draft.type === "arrow")) {
      const dist = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
      if (dist > 4) addAnnotation(slotId, { ...draft, id: nextId() });
      setDraft(null);
    }
    drag.current = null;
  }

  function cancelDrag() {
    drag.current = null;
    setDraft(null);
  }

  function onImagePointerDown(e: React.PointerEvent) {
    if (!editable || tool !== "select") return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slotId);
    drag.current = { mode: "image", sx: p.x, sy: p.y, ox: t.x, oy: t.y };
    setSelected(IMAGE_SELECTION);
  }

  function onScaleHandleDown(e: React.PointerEvent<SVGGElement>) {
    if (!editable) return;
    e.stopPropagation();
    const handle = (e.currentTarget.dataset.handle ?? "br") as Corner;
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slotId);
    drag.current = { mode: "img-scale", handle, startPt: p, startScale: t.scale, center: view.corners.center };
  }

  function onRotateHandleDown(e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slotId);
    drag.current = { mode: "img-rotate", startPt: p, startRotation: t.rotation, center: view.corners.center };
  }

  function onCropHandleDown(e: React.PointerEvent<SVGGElement>) {
    if (!editable) return;
    e.stopPropagation();
    const handle = (e.currentTarget.dataset.handle ?? "br") as Corner;
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slotId);
    drag.current = { mode: "crop", handle };
  }

  function onAnnPointerDown(e: React.PointerEvent, ann: Annotation) {
    if (!editable || tool !== "select") return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slotId);
    setSelected(ann.id);
    drag.current = { mode: "ann", id: ann.id, sx: p.x, sy: p.y, orig: ann };
  }

  return {
    draft,
    onSvgPointerDown,
    onSvgPointerMove,
    onSvgPointerUp,
    cancelDrag,
    onImagePointerDown,
    onScaleHandleDown,
    onRotateHandleDown,
    onCropHandleDown,
    onAnnPointerDown,
  };
}
