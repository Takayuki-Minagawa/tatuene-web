"use client";
/** page.tsx から抽出した画面ロジックのフック（ズーム・空欄ジャンプ・ドラフト復元）。 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { engine, useEngineVersion } from "@/engine/store";
import type { SheetModel } from "@/engine/workbook";
import { loadDraft, clearDraft } from "@/lib/autosave";
import { applyData } from "@/lib/storage";
import type { VersionSettings } from "@/lib/version";

/** 表示倍率（縮小・拡大・全体フィット）。シート切替後も維持。 */
export function useZoom(mainRef: RefObject<HTMLElement | null>) {
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 2;
  const [scale, setScale] = useState(1);
  const clampScale = (s: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));
  const zoomBy = (delta: number) => setScale((s) => clampScale(s + delta));
  // 現在のシート全体がペインに収まる倍率を算出して適用（線形なので一発で確定する）
  function fitToView() {
    const pane = mainRef.current?.querySelector<HTMLElement>(".grid-scroll");
    if (!pane || !pane.scrollWidth || !pane.scrollHeight) return;
    const ratio =
      Math.min(pane.clientWidth / pane.scrollWidth, pane.clientHeight / pane.scrollHeight) *
      scale *
      0.98; // 端の罫線が切れないよう少し余白を残す
    setScale(clampScale(ratio));
  }
  return { scale, setScale, zoomBy, fitToView, MIN_SCALE, MAX_SCALE };
}

/** アクティブシートの空欄数と、次の空欄へのジャンプ。 */
export function useEmptyJump(
  mainRef: RefObject<HTMLElement | null>,
  active: string,
  sheetModel: SheetModel,
) {
  const version = useEngineVersion(); // 入力で空欄数が変わるので購読
  const emptyCount = useMemo(() => {
    const dropdowns = new Set(sheetModel.dropdownCells);
    const isBlank = (v: unknown) =>
      v === null || v === undefined || String(v).trim() === "";
    return sheetModel.inputs.filter(
      (i) => !dropdowns.has(i.addr) && isBlank(engine().getInputRaw(active, i.addr)),
    ).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, active, sheetModel]);

  function jumpNextEmpty() {
    const root = mainRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-empty="1"]'));
    if (nodes.length === 0) return;
    // 現在フォーカス中の空欄の「次」へ。空欄数が変動してもズレないよう毎回探索する。
    const cur = nodes.indexOf(document.activeElement as HTMLElement);
    const el = nodes[(cur + 1) % nodes.length]; // cur=-1（未フォーカス）なら先頭へ
    el.scrollIntoView({ block: "center", inline: "center" });
    el.focus();
  }

  return { emptyCount, jumpNextEmpty };
}

/** 起動時に前回のドラフトがあれば復元確認する（1回限り）。 */
export function useDraftRestore(opts: {
  onVersionSettings: (vs: VersionSettings) => void;
  flash: (m: string) => void;
}) {
  const { onVersionSettings, flash } = opts;
  const draftChecked = useRef(false);
  useEffect(() => {
    if (draftChecked.current) return;
    draftChecked.current = true;
    void (async () => {
      const draft = await loadDraft();
      if (!draft) return;
      const when = draft.data.savedAt
        ? new Date(draft.data.savedAt).toLocaleString("ja-JP")
        : "日時不明";
      if (confirm(`前回の編集データが残っています（${when}）。復元しますか？`)) {
        try {
          const vs = applyData(draft.data, draft.images);
          if (vs) onVersionSettings(vs);
          flash("前回の編集を復元しました");
        } catch (err) {
          // 壊れたドラフトは破棄する。残すと次回起動でも同じ復元で失敗し続けるため。
          clearDraft();
          flash(
            "復元に失敗したため、残っていた編集データを破棄しました: " +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      } else {
        clearDraft();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
