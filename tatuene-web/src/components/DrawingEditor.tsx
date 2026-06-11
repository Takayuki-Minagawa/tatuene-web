"use client";
/**
 * 図面配置枠の編集器（1枠）。SVGで画像＋注釈を描画する。
 *  - editable=true（評価シート画面）: アップロード/移動/拡大縮小/回転/直線・矢印・丸数字・テキスト/削除
 *  - editable=false（PDF帳票・ReportFrame）: 画像と注釈を焼き込み表示（操作不可）
 *
 * 座標系は枠の「scale=1 px箱」ローカル座標。画面・PDFとも scale=1 描画なので保存値で再現可能。
 */
import React, { useRef, useState } from "react";
import type { DrawingSlot } from "@/engine/workbook";
import { importImageBlob, pickImageFile } from "@/drawings/importImage";
import {
  fitContain,
  imageCorners,
  scaleFromHandleDrag,
  rotationFromHandleDrag,
  frameToImageLocal,
  imageLocalToFrame,
  cropToLocalRect,
  cropFromHandleDrag,
  FULL_CROP,
  type Pt,
} from "@/drawings/geometry";
import {
  useDrawingsVersion,
  getSlot,
  setImage,
  setTransform,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  clearSlot,
  nextId,
  nextNumber,
  snapshot,
  undo,
  redo,
  canUndo,
  canRedo,
  type Annotation,
} from "@/drawings/store";

type Tool = "select" | "line" | "arrow" | "number" | "text" | "crop";

const COLORS = ["#d32f2f", "#1565c0", "#000000", "#2e7d32", "#f9a825"];

/** 画像選択を表す selected の特殊値（注釈IDは a<number> 形式なので衝突しない） */
const IMAGE_SELECTION = "__image__";

type Corner = "tl" | "tr" | "br" | "bl";

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
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const drag = useRef<
    | null
    | { mode: "image"; sx: number; sy: number; ox: number; oy: number }
    | { mode: "ann"; id: string; sx: number; sy: number; orig: Annotation }
    | { mode: "draw"; sx: number; sy: number }
    | { mode: "img-scale"; handle: Corner; startPt: Pt; startScale: number; center: Pt }
    | { mode: "img-rotate"; startPt: Pt; startRotation: number; center: Pt }
    | { mode: "crop"; handle: Corner }
  >(null);

  const fit = fitContain(state.natW ?? 0, state.natH ?? 0, width, height);
  const t = state.transform;
  const imgX = fit.x + t.x;
  const imgY = fit.y + t.y;
  const cx = imgX + fit.w / 2;
  const cy = imgY + fit.h / 2;
  // 適用順（右から）: flip → scale → rotate（いずれも画像中心基準）
  const flipPart =
    t.flipH || t.flipV ? ` translate(${cx} ${cy}) scale(${t.flipH ? -1 : 1} ${t.flipV ? -1 : 1}) translate(${-cx} ${-cy})` : "";
  const imgTransform = `rotate(${t.rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${t.scale}) translate(${-cx} ${-cy})${flipPart}`;
  const corners = imageCorners(fit, t);
  const crop = t.crop ?? FULL_CROP;
  const hasCrop = !!t.crop;
  const cropRect = cropToLocalRect(crop, fit, t);
  const brightness = t.brightness ?? 1;

  function toLocal(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

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

  // ---- ポインタ操作（描画/移動） ----
  function onSvgPointerDown(e: React.PointerEvent) {
    if (!editable) return;
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (tool === "line" || tool === "arrow") {
      drag.current = { mode: "draw", sx: p.x, sy: p.y };
      setDraft({ id: "draft", type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: lineWidth });
    } else if (tool === "number") {
      addAnnotation(slot.id, { id: nextId(), type: "number", x: p.x, y: p.y, value: nextNumber(slot.id), color, size: 18 });
    } else if (tool === "text") {
      const txt = window.prompt("テキストを入力", "");
      if (txt) addAnnotation(slot.id, { id: nextId(), type: "text", x: p.x, y: p.y, text: txt, color, size: 16 });
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
      setTransform(slot.id, { x: d.ox + (p.x - d.sx), y: d.oy + (p.y - d.sy) });
    } else if (d.mode === "img-scale") {
      setTransform(slot.id, { scale: scaleFromHandleDrag(d.center, d.startPt, p, d.startScale) });
    } else if (d.mode === "img-rotate") {
      setTransform(slot.id, { rotation: rotationFromHandleDrag(d.center, d.startPt, p, d.startRotation, e.shiftKey) });
    } else if (d.mode === "crop") {
      const local = frameToImageLocal(p, fit, t);
      setTransform(slot.id, { crop: cropFromHandleDrag(crop, d.handle, local, fit, t) });
    } else if (d.mode === "ann") {
      const dx = p.x - d.sx,
        dy = p.y - d.sy;
      const o = d.orig;
      switch (o.type) {
        case "line":
        case "arrow":
          updateAnnotation(slot.id, d.id, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
          break;
        default:
          updateAnnotation(slot.id, d.id, { x: o.x + dx, y: o.y + dy });
      }
    }
  }

  function onSvgPointerUp(e: React.PointerEvent) {
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.mode === "draw" && draft && (draft.type === "line" || draft.type === "arrow")) {
      const dist = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
      if (dist > 4) addAnnotation(slot.id, { ...draft, id: nextId() });
      setDraft(null);
    }
    drag.current = null;
  }

  function onImagePointerDown(e: React.PointerEvent) {
    if (!editable || tool !== "select") return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slot.id);
    drag.current = { mode: "image", sx: p.x, sy: p.y, ox: t.x, oy: t.y };
    setSelected(IMAGE_SELECTION);
  }

  function onScaleHandleDown(e: React.PointerEvent<SVGGElement>) {
    if (!editable) return;
    e.stopPropagation();
    const handle = (e.currentTarget.dataset.handle ?? "br") as Corner;
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slot.id);
    drag.current = { mode: "img-scale", handle, startPt: p, startScale: t.scale, center: corners.center };
  }

  function onRotateHandleDown(e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slot.id);
    drag.current = { mode: "img-rotate", startPt: p, startRotation: t.rotation, center: corners.center };
  }

  function onCropHandleDown(e: React.PointerEvent<SVGGElement>) {
    if (!editable) return;
    e.stopPropagation();
    const handle = (e.currentTarget.dataset.handle ?? "br") as Corner;
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slot.id);
    drag.current = { mode: "crop", handle };
  }

  /** 切り抜きモードを終了。ほぼ全面のままなら crop なし扱いに戻す。 */
  function finishCrop() {
    const c = t.crop;
    if (c && c.x < 0.005 && c.y < 0.005 && c.w > 0.99 && c.h > 0.99) {
      setTransform(slot.id, { crop: undefined });
    }
    setTool("select");
  }

  function cancelDrag() {
    drag.current = null;
    setDraft(null);
  }

  function onAnnPointerDown(e: React.PointerEvent, ann: Annotation) {
    if (!editable || tool !== "select") return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshot(slot.id);
    setSelected(ann.id);
    drag.current = { mode: "ann", id: ann.id, sx: p.x, sy: p.y, orig: ann };
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

  function editText(ann: Extract<Annotation, { type: "text" }>) {
    const txt = window.prompt("テキストを編集", ann.text);
    if (txt !== null && txt !== ann.text) {
      snapshot(slot.id);
      updateAnnotation(slot.id, ann.id, { text: txt } as Partial<Annotation>);
    }
  }

  // ---- 注釈の描画 ----
  function renderAnn(ann: Annotation) {
    const sel = editable && selected === ann.id;
    const hit = editable ? "auto" : "none";
    if (ann.type === "line" || ann.type === "arrow") {
      const a = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const ah = 10 + ann.width * 2,
        aw = 4 + ann.width * 1.3;
      const dx = Math.cos(a),
        dy = Math.sin(a);
      const bx = ann.x2 - ah * dx,
        by = ann.y2 - ah * dy;
      return (
        <g key={ann.id} style={{ cursor: editable ? "move" : "default" }} onPointerDown={(e) => onAnnPointerDown(e, ann)}>
          {/* 当たり判定を広げる透明線 */}
          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke="transparent" strokeWidth={Math.max(12, ann.width + 10)} style={{ pointerEvents: hit }} />
          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={ann.color} strokeWidth={ann.width} strokeLinecap="round" style={{ pointerEvents: "none" }} />
          {ann.type === "arrow" && (
            <polygon points={`${ann.x2},${ann.y2} ${bx + aw * -dy},${by + aw * dx} ${bx - aw * -dy},${by - aw * dx}`} fill={ann.color} style={{ pointerEvents: "none" }} />
          )}
          {sel && <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke="#0a84ff" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} />}
        </g>
      );
    }
    if (ann.type === "number") {
      const r = ann.size;
      return (
        <g key={ann.id} style={{ cursor: editable ? "move" : "default", pointerEvents: hit }} onPointerDown={(e) => onAnnPointerDown(e, ann)}>
          <circle cx={ann.x} cy={ann.y} r={r} fill="#fff" stroke={ann.color} strokeWidth={2} />
          <text x={ann.x} y={ann.y} fill={ann.color} fontSize={r * 1.1} textAnchor="middle" dominantBaseline="central" fontWeight={700} style={{ pointerEvents: "none", userSelect: "none" }}>
            {ann.value}
          </text>
          {sel && <circle cx={ann.x} cy={ann.y} r={r + 3} fill="none" stroke="#0a84ff" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} />}
        </g>
      );
    }
    if (ann.type !== "text") return null; // 到達しないが型を text に確定させる
    // text
    return (
      <g key={ann.id} style={{ cursor: editable ? "move" : "default", pointerEvents: hit }} onPointerDown={(e) => onAnnPointerDown(e, ann)} onDoubleClick={() => editable && editText(ann)}>
        <text x={ann.x} y={ann.y} fill={ann.color} fontSize={ann.size} dominantBaseline="hanging" fontWeight={600} style={{ userSelect: "none" }}>
          {ann.text}
        </text>
        {sel && <rect x={ann.x - 2} y={ann.y - 2} width={ann.text.length * ann.size * 0.62 + 4} height={ann.size + 4} fill="none" stroke="#0a84ff" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} />}
      </g>
    );
  }

  // ---- 切り抜き編集オーバーレイ（crop ツール時のみ） ----
  function renderCropOverlay() {
    const cr = cropRect;
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

  // ---- 画像選択時のバウンディングボックスと操作ハンドル（PDF側 editable=false では呼ばれない） ----
  function renderImageHandles() {
    const { tl, tr, br, bl, center } = corners;
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

  const hasImage = !!state.imageDataUrl;

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
                  value={brightness}
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
              <button className="draw-btn on" title="切り抜きを確定" onClick={finishCrop}>
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
            <button className="draw-btn warn" onClick={() => { removeAnnotation(slot.id, selected); setSelected(null); }}>
              注釈削除
            </button>
          )}
          <button className="draw-btn warn" onClick={() => { if (confirm(`「${slot.label}」の図面と注釈をすべて削除します。よろしいですか？`)) { clearSlot(slot.id); setSelected(null); } }}>
            図面削除
          </button>
        </div>
      )}

      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        tabIndex={editable ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={cancelDrag}
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
        {hasImage && (
          <g transform={imgTransform}>
            <defs>
              {brightness !== 1 && (
                <filter id={`br-${slot.id}`}>
                  <feComponentTransfer>
                    <feFuncR type="linear" slope={brightness} />
                    <feFuncG type="linear" slope={brightness} />
                    <feFuncB type="linear" slope={brightness} />
                  </feComponentTransfer>
                </filter>
              )}
              {hasCrop && (
                <clipPath id={`crop-${slot.id}`}>
                  <rect x={cropRect.x} y={cropRect.y} width={cropRect.w} height={cropRect.h} />
                </clipPath>
              )}
            </defs>
            {/* 切り抜き編集中は全体を見せるため clip を外す（外側は暗転表示） */}
            <g clipPath={hasCrop && tool !== "crop" ? `url(#crop-${slot.id})` : undefined}>
              <image
                href={state.imageDataUrl}
                x={imgX}
                y={imgY}
                width={fit.w}
                height={fit.h}
                preserveAspectRatio="none"
                opacity={t.opacity ?? 1}
                filter={brightness !== 1 ? `url(#br-${slot.id})` : undefined}
                onPointerDown={onImagePointerDown}
                style={{ cursor: editable && tool === "select" ? "move" : "inherit", pointerEvents: editable ? "auto" : "none" }}
              />
            </g>
          </g>
        )}
        {state.annotations.map(renderAnn)}
        {draft && renderAnn(draft)}
        {editable && hasImage && selected === IMAGE_SELECTION && tool !== "crop" && renderImageHandles()}
        {editable && hasImage && tool === "crop" && renderCropOverlay()}
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
