"use client";
/** モーダル共通の a11y フック：初期フォーカス・Escapeクローズ・Tabフォーカストラップ。
 *  返り値の panelRef をダイアログ本体に、closeBtnRef を閉じるボタンに、
 *  onKeyDown を本体の onKeyDown に割り当てる。背面の inert 化は呼び出し側で行う。 */
import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export function useModalA11y(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // 開いたら閉じるボタンへ初期フォーカス
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const root = panelRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  return { panelRef, closeBtnRef, onKeyDown };
}
