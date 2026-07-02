"use client";
/**
 * 数式セルの表示値。そのセルの表示文字列だけを購読し、変化時のみ再描画する。
 * SheetGrid / RefTable 共通。
 */
import React from "react";
import { useDisplay } from "@/engine/store";

const FormulaCell = React.memo(function FormulaCell({
  sheet,
  addr,
}: {
  sheet: string;
  addr: string;
}) {
  return <>{useDisplay(sheet, addr)}</>;
});

export default FormulaCell;
