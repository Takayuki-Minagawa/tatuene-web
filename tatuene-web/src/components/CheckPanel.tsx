"use client";
import React from "react";
import type { Issue } from "@/engine/validate";
import { useModalA11y } from "./useModalA11y";

export default function CheckPanel({
  issues,
  onClose,
  onJump,
  onProceed,
}: {
  issues: Issue[];
  onClose: () => void;
  onJump: (sheet: string) => void;
  onProceed?: () => void; // 警告のみの場合に「このまま出力」
}) {
  const { panelRef, closeBtnRef, onKeyDown } = useModalA11y(onClose);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const ok = issues.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-title"
        className="bg-white rounded-lg shadow-2xl w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div
          id="check-title"
          className="px-5 py-3 rounded-t-lg text-white font-bold"
          style={{ background: "var(--head)" }}
        >
          データチェック結果
        </div>
        <div className="p-5 overflow-auto">
          {ok && (
            <div className="rounded-md p-3 text-sm" style={{ background: "#e8f6ec", color: "#1c6b34", border: "1px solid #9ed3ad" }}>
              ✅ 問題は見つかりませんでした。PDF帳票を出力できます。
            </div>
          )}
          {errors.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-bold mb-1" style={{ color: "#b3261e" }}>
                エラー（{errors.length}件）— 修正が必要です
              </div>
              <ul className="space-y-1">
                {errors.map((i, idx) => (
                  <li
                    key={idx}
                    className="text-sm rounded p-2 cursor-pointer"
                    style={{ background: "#fde8e6", border: "1px solid #f1b0aa" }}
                    onClick={() => onJump(i.sheet)}
                  >
                    ❌ {i.message}
                    <span className="text-xs opacity-60"> [{i.sheet}!{i.addr}]</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-1" style={{ color: "#8a5a12" }}>
                警告（{warnings.length}件）— 確認をおすすめします
              </div>
              <ul className="space-y-1">
                {warnings.map((i, idx) => (
                  <li
                    key={idx}
                    className="text-sm rounded p-2 cursor-pointer"
                    style={{ background: "#fff3e0", border: "1px solid #f0c081" }}
                    onClick={() => onJump(i.sheet)}
                  >
                    ⚠ {i.message}
                    <span className="text-xs opacity-60"> [{i.sheet}!{i.addr}]</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <button
            ref={closeBtnRef}
            className="toolbar-btn"
            style={{ background: "#eee", color: "#333" }}
            onClick={onClose}
          >
            閉じる
          </button>
          {errors.length === 0 && onProceed && (
            <button
              className="toolbar-btn"
              style={{ background: "var(--head)", color: "#fff" }}
              onClick={onProceed}
            >
              このままPDF出力
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
