"use client";
/** モーダル共通の a11y フック：初期フォーカス・Escapeクローズ・Tabフォーカストラップ。
 *  返り値の panelRef をダイアログ本体に、closeBtnRef を閉じるボタンに、
 *  onKeyDown を本体の onKeyDown に割り当てる。背面の inert 化は呼び出し側で行う。 */
import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export function useModalA11y(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // 開いたらダイアログ本体へ初期フォーカス（aria-labelledby のタイトルから読み上げ開始）。
  // panel には tabIndex={-1} を付与しておくこと。取得できなければ閉じるボタンへ。
  useEffect(() => {
    (panelRef.current ?? closeBtnRef.current)?.focus();
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
        // disabled・非表示（display:none 等）の要素はトラップ計算から除外する
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          (el) =>
            !el.hasAttribute("disabled") &&
            el.getAttribute("aria-hidden") !== "true" &&
            el.offsetParent !== null
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
