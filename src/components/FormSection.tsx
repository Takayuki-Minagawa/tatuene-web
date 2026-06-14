"use client";
/**
 * フォームの1セクション。折りたたみ可能。見出し＋空欄バッジ＋（あれば）解説トグル。
 * 中身は FormField の並び、または参照表（RefTable）。
 */
import React, { useId, useMemo, useState } from "react";
import FormField from "./FormField";
import RefTable from "./RefTable";
import { engine, useEngineVersion } from "@/engine/store";
import type { FormSection as Section } from "@/lib/sheet-parser";

function FormSection({ sheet, section }: { sheet: string; section: Section }) {
  const [open, setOpen] = useState(section.defaultOpen);
  const [showHelp, setShowHelp] = useState(false);
  const bodyId = useId();
  const version = useEngineVersion();

  // 入力項目のうち空欄の数（バッジ表示用）。
  const emptyCount = useMemo(() => {
    if (section.kind !== "fields") return 0;
    return section.items.filter((it) => {
      if (it.kind !== "input" && it.kind !== "dropdown") return false;
      const v = engine().getInputRaw(sheet, it.addr);
      return v === null || v === undefined || String(v).trim() === "";
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, sheet, section]);

  return (
    <section className="form-section">
      <div className="form-section-head">
        <button
          type="button"
          className="form-section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="form-section-caret">{open ? "▼" : "▶"}</span>
          <span className="form-section-title">{section.title}</span>
        </button>
        {emptyCount > 0 && <span className="form-section-badge">空欄 {emptyCount}</span>}
        {section.guidance && (
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
      {section.guidance && showHelp && (
        <p className="form-section-help">{section.guidance}</p>
      )}
      <div id={bodyId} hidden={!open}>
        {section.kind === "reftable" && section.reftable ? (
          <RefTable sheet={sheet} region={section.reftable} />
        ) : (
          <div className="form-fields">
            {section.items.map((it) => (
              <FormField key={it.addr} sheet={sheet} item={it} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default React.memo(FormSection);
