"use client";
/**
 * 注釈（直線・矢印・丸数字・テキスト）の描画レイヤ（DrawingEditor から抽出）。
 */
import React from "react";
import type { Annotation } from "@/drawings/store";

export default function AnnotationLayer({
  annotations,
  draft,
  selected,
  editable,
  onAnnPointerDown,
  onEditText,
}: {
  annotations: Annotation[];
  draft: Annotation | null;
  selected: string | null;
  editable: boolean;
  onAnnPointerDown: (e: React.PointerEvent, ann: Annotation) => void;
  onEditText: (ann: Extract<Annotation, { type: "text" }>) => void;
}) {
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
      <g key={ann.id} style={{ cursor: editable ? "move" : "default", pointerEvents: hit }} onPointerDown={(e) => onAnnPointerDown(e, ann)} onDoubleClick={() => editable && onEditText(ann)}>
        <text x={ann.x} y={ann.y} fill={ann.color} fontSize={ann.size} dominantBaseline="hanging" fontWeight={600} style={{ userSelect: "none" }}>
          {ann.text}
        </text>
        {sel && <rect x={ann.x - 2} y={ann.y - 2} width={ann.text.length * ann.size * 0.62 + 4} height={ann.size + 4} fill="none" stroke="#0a84ff" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} />}
      </g>
    );
  }

  return (
    <>
      {annotations.map(renderAnn)}
      {draft && renderAnn(draft)}
    </>
  );
}
