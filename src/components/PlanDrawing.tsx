"use client";
/**
 * 間取り図セクションの作図エディタ（計算シート内）。
 * 評価シートの図面枠と同じ DrawingEditor を、固定の基準サイズ(A4縦比)で表示する。
 * スロットIDは評価シートの「現状図／改修図」と共有するため、ここで作図した内容は
 * 評価シートにそのままコピー表示される（評価側は読み取り専用の縮小コピー）。
 */
import React from "react";
import DrawingEditor from "./DrawingEditor";
import { engine } from "@/engine/store";
import { SHEETS } from "@/lib/sheets";
import { PLAN_AUTHOR_W, PLAN_AUTHOR_H } from "@/drawings/planFrame";
import type { DrawingSlot } from "@/engine/workbook";

export default function PlanDrawing({ slotId }: { slotId: string }) {
  const evalSlots = engine().model.sheets[SHEETS.evaluation]?.drawingSlots ?? [];
  const slot: DrawingSlot =
    evalSlots.find((s) => s.id === slotId) ?? {
      id: slotId,
      label: "間取り図",
      fromCol: 0, fromColOff: 0, fromRow: 0, fromRowOff: 0,
      toCol: 0, toColOff: 0, toRow: 0, toRowOff: 0,
    };
  return (
    <div className="plan-draw-wrap">
      {/* 図面エディタ本体は absolute 配置のため、サイズを持つ relative 枠で受ける。
          ツールバーは枠の上端(top:-32px)に出るので wrap 側で上余白を確保。 */}
      <div className="plan-draw-frame" style={{ width: PLAN_AUTHOR_W, height: PLAN_AUTHOR_H }}>
        <DrawingEditor slot={slot} width={PLAN_AUTHOR_W} height={PLAN_AUTHOR_H} editable />
      </div>
    </div>
  );
}
