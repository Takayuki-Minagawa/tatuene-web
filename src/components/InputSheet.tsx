"use client";
/**
 * 入力シートの新フォーム描画（A4縦幅・単一列・入力欄を目立たせる）。
 * model.json をパースしてセクション→項目に変換し、FormSection で描画する。
 * 計算結果に使う評価シートは対象外（従来の SheetGrid 忠実描画のまま）。
 */
import React, { useMemo } from "react";
import FormSection from "./FormSection";
import { parseSheet } from "@/lib/sheet-parser";
import { getSheetLayout } from "@/lib/sheet-layout";
import { engine } from "@/engine/store";

export default function InputSheet({ sheetName }: { sheetName: string }) {
  const form = useMemo(
    () => parseSheet(sheetName, engine().model.sheets[sheetName], getSheetLayout(sheetName)),
    [sheetName],
  );
  return (
    <div className="input-form">
      <h1 className="input-form-title">{sheetName}</h1>
      {form.sections.map((s) => (
        <FormSection key={s.id} sheet={sheetName} section={s} />
      ))}
    </div>
  );
}
