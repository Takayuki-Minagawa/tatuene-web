"use client";
import React, { useRef, useState } from "react";
import { flushSync } from "react-dom";
import SheetGrid from "@/components/SheetGrid";
import InputSheet from "@/components/InputSheet";
import { getSheetLayout } from "@/lib/sheet-layout";
import CheckPanel from "@/components/CheckPanel";
import Manual from "@/components/Manual";
import ReportFrame, { REPORT_FRAME_ID } from "@/components/ReportFrame";
import { engine, resetDefaults } from "@/engine/store";
import { clearAll as clearDrawings } from "@/drawings/store";
import { downloadBundle, loadFile } from "@/lib/storage";
import { useDraftAutosave, clearDraft, skipNextAutosave } from "@/lib/autosave";
import { validate, type Issue } from "@/engine/validate";
import { exportReportPdf } from "@/lib/pdf";
import { SHEETS } from "@/lib/sheets";
import { useZoom, useEmptyJump, useDraftRestore } from "./hooks";

export default function Home() {
  const model = engine().model;
  const sheets = model.sheetOrder;
  const [active, setActive] = useState(sheets[0]);
  const [msg, setMsg] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [showManual, setShowManual] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 表示倍率（縮小・拡大・全体フィット）
  const mainRef = useRef<HTMLElement>(null);
  const { scale, setScale, zoomBy, fitToView, MIN_SCALE, MAX_SCALE } = useZoom(mainRef);

  // PDF生成時のみ帳票(評価シート)をマウントする
  const [reportMounted, setReportMounted] = useState(false);

  // 入力モード（入力欄を含む行だけ表示）と、未入力(空欄)の可視化・ジャンプ
  const [inputOnly, setInputOnly] = useState(false);
  const sheetModel = model.sheets[active];
  const { emptyCount, jumpNextEmpty } = useEmptyJump(mainRef, active, sheetModel);
  // フォーム表示のシートでは、グリッド専用の操作（入力モード・空欄ジャンプ・表示倍率）は出さない。
  const isFormSheet = !!getSheetLayout(active);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }

  // ドラフト自動保存と、起動時の復元確認
  useDraftAutosave();
  useDraftRestore({ flash });

  function runCheck() {
    setIssues(validate(engine()));
  }

  async function generatePdf() {
    setIssues(null);
    flash("PDFを生成しています…");
    // 帳票(評価シート)は常時ではなく生成時だけマウントする（常駐描画コストの削減）。
    flushSync(() => setReportMounted(true));
    try {
      // マウント・レイアウト確定を待ってから捕捉する
      await new Promise<void>((res) =>
        requestAnimationFrame(() => requestAnimationFrame(() => res())),
      );
      const node = document.getElementById(REPORT_FRAME_ID);
      if (!node) throw new Error("帳票が見つかりません");
      const title = (engine().getInputRaw(SHEETS.cover, "E30") as string) || "診断";
      await exportReportPdf(node, title);
      flash("PDF帳票を保存しました");
    } catch (e: any) {
      flash("PDF生成エラー: " + (e?.message ?? e));
    } finally {
      setReportMounted(false);
    }
  }

  function onPdfClick() {
    const iss = validate(engine());
    if (iss.some((i) => i.level === "error")) {
      setIssues(iss); // エラーがあれば出力をブロックしパネル表示
    } else if (iss.length > 0) {
      setIssues(iss); // 警告のみ → 「このまま出力」を提示
    } else {
      generatePdf();
    }
  }

  async function onLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      skipNextAutosave();
      await loadFile(f);
      clearDraft(); // 明示的な読込でドラフトは破棄（以後の編集で再作成される）
      flash(`読込完了: ${f.name}`);
    } catch (err: any) {
      flash(`読込エラー: ${err.message ?? err}`);
    } finally {
      e.target.value = "";
    }
  }

  const modalOpen = showManual || issues !== null;

  return (
    <>
      {/* モーダル表示中は背面UIを inert 化（フォーカス・操作を無効化） */}
      <div className="flex flex-col h-screen" inert={modalOpen ? true : undefined}>
        {/* ヘッダー */}
        <header
        className="flex items-center gap-3 px-4 py-2 text-white flex-wrap"
        style={{ background: "var(--head)" }}
      >
        <span className="font-bold text-lg">達エネ断熱シミュレーター</span>
        <span className="text-xs opacity-85">Web版</span>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            className="toolbar-btn"
            style={{ background: "transparent", border: "1px solid #ffffff66", color: "#fff" }}
            onClick={() => setShowManual(true)}
          >
            ❓ 使い方
          </button>
          <button
            className="toolbar-btn"
            style={{ background: "transparent", border: "1px solid #ffffff66", color: "#fff" }}
            onClick={() => fileRef.current?.click()}
          >
            📂 読込
          </button>
          <button
            className="toolbar-btn"
            style={{ background: "transparent", border: "1px solid #ffffff66", color: "#fff" }}
            onClick={async () => {
              try {
                await downloadBundle();
                clearDraft();
                flash("保存しました（.zip）");
              } catch (err: any) {
                flash("保存エラー: " + (err?.message ?? err));
              }
            }}
          >
            💾 保存
          </button>
          <button
            className="toolbar-btn"
            style={{ background: "#fff", color: "var(--head)" }}
            onClick={runCheck}
          >
            ✓ データチェック
          </button>
          <button
            className="toolbar-btn"
            style={{ background: "#ffd54a", color: "#5a4500" }}
            onClick={onPdfClick}
          >
            ⬇ PDF帳票
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.json,application/json,application/zip"
            className="hidden"
            onChange={onLoad}
          />
        </div>
      </header>

      {/* タブ */}
      <div className="flex gap-1 px-3 pt-1" style={{ background: "#dfe5e1" }}>
        {sheets.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className="px-4 py-2 text-sm rounded-t-lg"
            style={{
              background: active === s ? "#fff" : "#cdd6d0",
              fontWeight: active === s ? 700 : 400,
              color: active === s ? "var(--head)" : "#333",
            }}
          >
            {s}
          </button>
        ))}
        {/* 入力支援（入力モード切替・未入力ジャンプ）・表示倍率 ※グリッド表示のシートのみ */}
        {!isFormSheet && (
        <>
        <div className="ml-auto flex items-center gap-1 self-center pr-2 text-xs text-slate-600">
          <button
            onClick={() => setInputOnly((v) => !v)}
            aria-pressed={inputOnly}
            className={
              "px-2 py-1 rounded border " +
              (inputOnly
                ? "border-green-700 bg-green-700 text-white"
                : "border-slate-300 bg-white hover:bg-slate-100")
            }
            title="入力欄を含む行だけに絞って表示（評価シートは対象外）"
          >
            入力モード
          </button>
          <button
            onClick={jumpNextEmpty}
            disabled={emptyCount === 0}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
            title="次の空欄の入力へ移動"
          >
            空欄 {emptyCount}｜次へ ⏭
          </button>
        </div>
        {/* 表示倍率（縮小・拡大・全体表示・標準に戻す） */}
        <div role="group" aria-label="表示倍率" className="flex items-center gap-1 self-center pr-1 text-xs text-slate-600">
          <button
            onClick={() => zoomBy(-0.1)}
            disabled={scale <= MIN_SCALE}
            className="w-7 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
            title="縮小"
            aria-label="縮小"
          >
            －
          </button>
          <span className="w-12 text-center tabular-nums" aria-live="polite" title="現在の表示倍率">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => zoomBy(0.1)}
            disabled={scale >= MAX_SCALE}
            className="w-7 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
            title="拡大"
            aria-label="拡大"
          >
            ＋
          </button>
          <button
            onClick={fitToView}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100"
            title="シート全体がペインに収まるように表示"
          >
            全体
          </button>
          <button
            onClick={() => setScale(1)}
            disabled={scale === 1}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
            title="標準サイズ（100%）に戻す"
          >
            100%
          </button>
        </div>
        </>
        )}
        <button
          className={isFormSheet ? "ml-auto px-3 py-2 text-xs self-center" : "px-3 py-2 text-xs self-center"}
          onClick={() => {
            if (confirm("すべての入力と図面を初期状態に戻します。よろしいですか？")) {
              skipNextAutosave();
              resetDefaults();
              clearDrawings();
              clearDraft();
              flash("初期化しました");
            }
          }}
          style={{ color: "#666" }}
        >
          ↺ 初期化
        </button>
      </div>

      {/* グリッド／フォーム */}
      <main
        ref={mainRef}
        className={
          // 評価シートは出力帳票なので「空欄ガイド」のハイライト（黄色＋オレンジ縦線）を出さない。
          (active === SHEETS.evaluation ? "" : "input-guide ") +
          "flex-1 p-3 " +
          (getSheetLayout(active) ? "overflow-auto" : "overflow-hidden")
        }
        style={{ background: "#eef0f2" }}
      >
        {getSheetLayout(active) ? (
          <InputSheet sheetName={active} />
        ) : (
          <SheetGrid
            sheetName={active}
            model={model.sheets[active]}
            faithful={active === SHEETS.evaluation}
            // 評価シートの図は計算シートの図のコピー表示のみ。ここでは編集させない
            // （slot1/slot2＝コピー、slot3＝空スロットの編集UIも出さない）。
            interactiveDrawings={false}
            scale={scale}
            inputOnly={inputOnly}
          />
        )}
      </main>

        {/* PDF捕捉用（オフスクリーン）。生成時のみマウントして常駐描画コストを避ける */}
        {reportMounted && <ReportFrame />}
      </div>

      {/* 操作マニュアル（inert領域の外） */}
      {showManual && <Manual onClose={() => setShowManual(false)} />}

      {/* データチェック結果（inert領域の外） */}
      {issues && (
        <CheckPanel
          issues={issues}
          onClose={() => setIssues(null)}
          onJump={(sheet) => {
            setActive(sheet);
            setIssues(null);
          }}
          onProceed={generatePdf}
        />
      )}

      {/* トースト */}
      {msg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-sm"
          style={{ background: "#222", color: "#fff" }}
        >
          {msg}
        </div>
      )}
    </>
  );
}
