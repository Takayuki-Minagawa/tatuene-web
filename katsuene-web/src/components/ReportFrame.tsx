"use client";
/** 評価シート(帳票)をオフスクリーンで忠実描画。PDF取得用の捕捉対象。 */
import React from "react";
import SheetGrid from "./SheetGrid";
import { engine } from "@/engine/store";

export const REPORT_FRAME_ID = "report-frame";

export default function ReportFrame() {
  const model = engine().model.sheets["評価シート"];
  return (
    <div
      id={REPORT_FRAME_ID}
      style={{
        position: "fixed",
        left: -100000,
        top: 0,
        background: "#fff",
        padding: 10,
        display: "inline-block",
      }}
      aria-hidden
    >
      <SheetGrid sheetName="評価シート" model={model} faithful />
    </div>
  );
}
