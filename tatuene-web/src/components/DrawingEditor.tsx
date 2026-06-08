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
  type Annotation,
} from "@/drawings/store";

type Tool = "select" | "line" | "arrow" | "number" | "text";

const COLORS = ["#d32f2f", "#1565c0", "#000000", "#2e7d32", "#f9a825"];

/** 画像を箱に contain フィットしたときの寸法と左上座標 */
function fitContain(natW: number, natH: number, boxW: number, boxH: number) {
  if (!natW || !natH) return { w: boxW, h: boxH, x: 0, y: 0 };
  const s = Math.min(boxW / natW, boxH / natH);
  const w = natW * s,
    h = natH * s;
  return { w, h, x: (boxW - w) / 2, y: (boxH - h) / 2 };
}

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
  const drag = useRef<
    | null
    | { mode: "image"; sx: number; sy: number; ox: number; oy: number }
    | { mode: "ann"; id: string; sx: number; sy: number; orig: Annotation }
    | { mode: "draw"; sx: number; sy: number }
  >(null);

  const fit = fitContain(state.natW ?? 0, state.natH ?? 0, width, height);
  const t = state.transform;
  const imgX = fit.x + t.x;
  const imgY = fit.y + t.y;
  const cx = imgX + fit.w / 2;
  const cy = imgY + fit.h / 2;
  const imgTransform = `rotate(${t.rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${t.scale}) translate(${-cx} ${-cy})`;

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

  // ---- ファイルアップロード ----
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setImage(slot.id, {
          dataUrl,
          name: f.name,
          type: f.type || "image/png",
          natW: img.naturalWidth,
          natH: img.naturalHeight,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
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
    } else {
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
    drag.current = { mode: "image", sx: p.x, sy: p.y, ox: t.x, oy: t.y };
    setSelected(null);
  }

  function onAnnPointerDown(e: React.PointerEvent, ann: Annotation) {
    if (!editable || tool !== "select") return;
    e.stopPropagation();
    const p = toLocal(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    setSelected(ann.id);
    drag.current = { mode: "ann", id: ann.id, sx: p.x, sy: p.y, orig: ann };
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!editable) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      removeAnnotation(slot.id, selected);
      setSelected(null);
    }
  }

  function editText(ann: Extract<Annotation, { type: "text" }>) {
    const txt = window.prompt("テキストを編集", ann.text);
    if (txt !== null) updateAnnotation(slot.id, ann.id, { text: txt } as Partial<Annotation>);
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

  const hasImage = !!state.imageDataUrl;

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height }}>
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
          {hasImage && (
            <>
              <label className="draw-range" title="拡大縮小">
                拡
                <input type="range" min={0.2} max={3} step={0.05} value={t.scale} onChange={(e) => setTransform(slot.id, { scale: Number(e.target.value) })} />
              </label>
              <label className="draw-range" title="回転">
                回
                <input type="range" min={-180} max={180} value={t.rotation} onChange={(e) => setTransform(slot.id, { rotation: Number(e.target.value) })} />
              </label>
            </>
          )}
          {selected && (
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
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: editable ? "auto" : "none",
          outline: editable ? "1px dashed #b7c4de" : "none",
          background: editable && !hasImage ? "rgba(183,196,222,0.06)" : "transparent",
          touchAction: "none",
          cursor: tool === "select" ? "default" : "crosshair",
        }}
      >
        {hasImage && (
          <image
            href={state.imageDataUrl}
            x={imgX}
            y={imgY}
            width={fit.w}
            height={fit.h}
            transform={imgTransform}
            preserveAspectRatio="none"
            onPointerDown={onImagePointerDown}
            style={{ cursor: editable && tool === "select" ? "move" : "inherit", pointerEvents: editable ? "auto" : "none" }}
          />
        )}
        {state.annotations.map(renderAnn)}
        {draft && renderAnn(draft)}
        {editable && !hasImage && (
          <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fill="#9aa6bd" fontSize={13} style={{ pointerEvents: "none", userSelect: "none" }}>
            「画像」から図面をアップロード
          </text>
        )}
      </svg>
    </div>
  );
}
