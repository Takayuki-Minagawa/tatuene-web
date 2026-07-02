"use client";
/** page.tsx から抽出した画面ロジックのフック（ズーム・空欄ジャンプ・ドラフト復元）。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { engine, useEngineVersion } from "@/engine/store";
import { isBlank, type SheetModel } from "@/engine/workbook";
import { loadDraft, clearDraft } from "@/lib/autosave";
import { applyData } from "@/lib/storage";

/** 表示倍率（縮小・拡大・全体フィット）。シート切替後も維持。 */
export function useZoom(mainRef: RefObject<HTMLElement | null>) {
  // 横に広い帳票（評価シート）を全体フィットさせると2割を下回るため、下限は0.1
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 2;
  const [scale, setScale] = useState(1);
  const clampScale = (s: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));
  const zoomBy = (delta: number) => setScale((s) => clampScale(s + delta));
  // fitToView を連続呼び出し（自動フィットのリトライ等）しても正しく動くよう、
  // 現在倍率は ref で参照する（stateのクロージャだと直前の倍率で計算してしまう）
  const scaleRef = useRef(1);
  useEffect(() => {
    scaleRef.current = scale;
  });
  // 現在のシート全体がペインに収まる倍率を算出して適用（線形なので一発で確定する）
  const fitToView = useCallback(() => {
    const pane = mainRef.current?.querySelector<HTMLElement>(".grid-scroll");
    if (!pane || !pane.scrollWidth || !pane.scrollHeight) return;
    const ratio =
      Math.min(pane.clientWidth / pane.scrollWidth, pane.clientHeight / pane.scrollHeight) *
      scaleRef.current *
      0.98; // 端の罫線が切れないよう少し余白を残す
    setScale(clampScale(ratio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 幅だけをペインに合わせる（縦長の帳票の初期表示用。縦はスクロールで見る。
  // 行高はフォント下限より縮まないため、全体フィットだと過剰に縮小されてしまう）
  const fitToWidth = useCallback(() => {
    const pane = mainRef.current?.querySelector<HTMLElement>(".grid-scroll");
    if (!pane || !pane.scrollWidth) return;
    const ratio = (pane.clientWidth / pane.scrollWidth) * scaleRef.current * 0.98;
    setScale(clampScale(ratio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { scale, setScale, zoomBy, fitToView, fitToWidth, MIN_SCALE, MAX_SCALE };
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

/** ドロップされたエントリ群からファイルを収集（フォルダは3階層まで展開）。 */
async function walkEntries(entries: FileSystemEntry[], fallback: File[]): Promise<File[]> {
  if (entries.length === 0) return fallback;
  const out: File[] = [];
  async function walk(entry: FileSystemEntry, depth: number): Promise<void> {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      );
      out.push(f);
    } else if (entry.isDirectory && depth < 3) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries は分割返却されるため、空になるまで繰り返す
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) =>
          reader.readEntries(res, rej),
        );
        for (const child of batch) await walk(child, depth + 1);
      } while (batch.length > 0);
    }
  }
  for (const en of entries) await walk(en, 0);
  return out;
}

/**
 * 保存データ（.zip／.json＋画像、またはそれらを含むフォルダ）の
 * 画面全体へのドラッグ&ドロップ読込。図面エディタへの画像ドロップは
 * 各エディタ側が処理するため、保存データを含むドロップのみ扱う。
 */
export function useSaveDataDrop(onFiles: (files: File[]) => void) {
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });
  useEffect(() => {
    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    }
    function onDrop(e: DragEvent) {
      const dt = e.dataTransfer;
      if (!dt || !Array.from(dt.types).includes("Files")) return;
      // 既定動作（ファイルをブラウザで開いて画面が失われる）は常に抑止する。
      // エントリの取得はイベント中に同期で行う必要がある。
      e.preventDefault();
      const entries = Array.from(dt.items ?? [])
        .map((it) => it.webkitGetAsEntry?.())
        .filter((x): x is FileSystemEntry => !!x);
      const fallback = Array.from(dt.files ?? []);
      void walkEntries(entries, fallback).then((files) => {
        if (files.some((f) => /\.(zip|json)$/i.test(f.name))) handler.current(files);
      });
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}

/** 起動時に前回のドラフトがあれば復元確認する（1回限り）。 */
export function useDraftRestore(opts: {
  flash: (m: string, kind?: "info" | "error") => void;
  /** アプリ内確認ダイアログ（confirm() 相当の Promise API）。 */
  confirm: (message: string, o?: { okLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const { flash, confirm } = opts;
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
      const ok = await confirm(
        `前回の編集データが残っています（${when}）。復元しますか？`,
        { okLabel: "復元する", cancelLabel: "破棄する" },
      );
      if (ok) {
        try {
          applyData(draft.data, draft.images);
          flash("前回の編集を復元しました");
        } catch (err) {
          // 壊れたドラフトは破棄する。残すと次回起動でも同じ復元で失敗し続けるため。
          clearDraft();
          flash(
            "復元に失敗したため、残っていた編集データを破棄しました: " +
              (err instanceof Error ? err.message : String(err)),
            "error",
          );
        }
      } else {
        clearDraft();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
