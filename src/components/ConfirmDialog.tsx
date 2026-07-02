"use client";
/**
 * アプリ内の確認ダイアログ（ブラウザ標準 confirm() の置き換え）。
 * 使い方: const { confirmDialog, dialogElement } = useConfirm();
 *   const ok = await confirmDialog("メッセージ");
 * dialogElement は inert 領域の外（モーダル群と同じ場所）に描画すること。
 */
import React, { useCallback, useRef, useState } from "react";
import { useModalA11y } from "./useModalA11y";

function ConfirmDialog({
  message,
  okLabel = "OK",
  cancelLabel = "キャンセル",
  onResult,
}: {
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  onResult: (ok: boolean) => void;
}) {
  const { panelRef, closeBtnRef, onKeyDown } = useModalA11y(() => onResult(false));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={() => onResult(false)}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-message"
        tabIndex={-1}
        className="bg-white rounded-lg shadow-2xl w-[440px] max-w-[92vw] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="px-5 py-3 rounded-t-lg text-white font-bold" style={{ background: "var(--head)" }}>
          確認
        </div>
        <p id="confirm-message" className="px-5 py-4 text-sm whitespace-pre-wrap text-gray-800">
          {message}
        </p>
        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <button
            ref={closeBtnRef}
            className="toolbar-btn"
            style={{ background: "#eee", color: "#333" }}
            onClick={() => onResult(false)}
          >
            {cancelLabel}
          </button>
          <button
            className="toolbar-btn"
            style={{ background: "var(--head)", color: "#fff" }}
            onClick={() => onResult(true)}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ConfirmOptions {
  okLabel?: string;
  cancelLabel?: string;
}

/** confirm() 相当の Promise API とダイアログ要素を返すフック。 */
export function useConfirm(): {
  confirmDialog: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
  confirmOpen: boolean;
  dialogElement: React.ReactNode;
} {
  const [state, setState] = useState<{ message: string; opts?: ConfirmOptions } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmDialog = useCallback((message: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // 既に開いている場合は前の確認をキャンセル扱いで解決する
      resolver.current?.(false);
      resolver.current = resolve;
      setState({ message, opts });
    });
  }, []);

  const onResult = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  }, []);

  return {
    confirmDialog,
    confirmOpen: state !== null,
    dialogElement: state ? (
      <ConfirmDialog
        message={state.message}
        okLabel={state.opts?.okLabel}
        cancelLabel={state.opts?.cancelLabel}
        onResult={onResult}
      />
    ) : null,
  };
}
