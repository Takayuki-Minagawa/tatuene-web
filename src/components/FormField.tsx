"use client";
/**
 * フォームの1項目。ラベルを大きく目立たせ、入力欄（CellInput）＋単位を並べる。
 * 数式セルは読み取り専用の表示にする。項目ごとの解説は折りたたみで表示。
 */
import React, { useId, useState } from "react";
import CellInput from "./CellInput";
import { useDisplay } from "@/engine/store";
import type { FormItem } from "@/lib/sheet-parser";

function ReadOnlyValue({ sheet, addr }: { sheet: string; addr: string }) {
  const v = useDisplay(sheet, addr);
  return <span className="form-readonly">{v || "—"}</span>;
}

function FormField({ sheet, item }: { sheet: string; item: FormItem }) {
  const id = useId();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="form-field">
      <div className="form-field-head">
        <label className="form-label" htmlFor={item.kind === "formula" ? undefined : id}>
          {item.label}
        </label>
        {item.guidance && (
          <button
            type="button"
            className="form-help-toggle"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((v) => !v)}
          >
            解説{showHelp ? "▲" : "▼"}
          </button>
        )}
      </div>
      <div className="form-field-control">
        {item.kind === "formula" ? (
          <ReadOnlyValue sheet={sheet} addr={item.addr} />
        ) : (
          <span id={id} className="form-input-wrap">
            <CellInput
              sheet={sheet}
              addr={item.addr}
              isDropdown={item.kind === "dropdown"}
              align="left"
              numeric={item.numeric}
              label={item.label}
            />
          </span>
        )}
        {item.unit && <span className="form-unit">{item.unit}</span>}
      </div>
      {item.guidance && showHelp && <p className="form-field-help">{item.guidance}</p>}
    </div>
  );
}

export default React.memo(FormField);
