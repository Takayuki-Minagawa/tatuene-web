"use client";
import React, { useEffect, useRef, useState } from "react";
import SheetGrid from "@/components/SheetGrid";
import CheckPanel from "@/components/CheckPanel";
import Manual from "@/components/Manual";
import ReportFrame, { REPORT_FRAME_ID } from "@/components/ReportFrame";
import { engine, resetDefaults } from "@/engine/store";
import { clearAll as clearDrawings } from "@/drawings/store";
import { downloadBundle, loadFile, applyData } from "@/lib/storage";
import { useDraftAutosave, loadDraft, clearDraft, skipNextAutosave } from "@/lib/autosave";
import { validate, type Issue } from "@/engine/validate";
import { exportReportPdf } from "@/lib/pdf";
import { DEFAULT_VERSION_SETTINGS, type VersionSettings } from "@/lib/version";

function VersionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="version-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label}バージョン`}
      />
    </label>
  );
}

export default function Home() {
  const model = engine().model;
  const sheets = model.sheetOrder;
  const [active, setActive] = useState(sheets[0]);
  const [msg, setMsg] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [versionSettings, setVersionSettings] = useState<VersionSettings>(DEFAULT_VERSION_SETTINGS);
  const fileRef = useRef<HTMLInputElement>(null);

  // 表示倍率（縮小・拡大）。シート切替後も維持する。
  const [scale, setScale] = useState(1);
  const mainRef = useRef<HTMLElement>(null);
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 2;
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

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }

  // 編集内容のドラフト自動保存（再読込・クラッシュ対策）と起動時の復元確認
  useDraftAutosave(versionSettings);
  const draftChecked = useRef(false);
  useEffect(() => {
    if (draftChecked.current) return;
    draftChecked.current = true;
    void (async () => {
      const draft = await loadDraft();
      if (!draft) return;
      const when = draft.data.savedAt ? new Date(draft.data.savedAt).toLocaleString("ja-JP") : "日時不明";
      if (confirm(`前回の編集データが残っています（${when}）。復元しますか？`)) {
        try {
          const vs = applyData(draft.data, draft.images);
          if (vs) setVersionSettings(vs);
          flash("前回の編集を復元しました");
        } catch (err) {
          flash("復元に失敗しました: " + (err instanceof Error ? err.message : String(err)));
        }
      } else {
        clearDraft();
      }
    })();
  }, []);

  function runCheck() {
    setIssues(validate(engine()));
  }

  async function generatePdf() {
    setIssues(null);
    flash("PDFを生成しています…");
    try {
      const node = document.getElementById(REPORT_FRAME_ID);
      if (!node) throw new Error("帳票が見つかりません");
      const title = (engine().getInputRaw("表紙", "E30") as string) || "診断";
      await exportReportPdf(node, title);
      flash("PDF帳票を保存しました");
    } catch (e: any) {
      flash("PDF生成エラー: " + (e?.message ?? e));
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
      const loadedVersionSettings = await loadFile(f);
      if (loadedVersionSettings) setVersionSettings(loadedVersionSettings);
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
        <span className="font-bold text-lg">逹エネ断熱シミュレーター</span>
        <div className="version-settings" aria-label="バージョン管理">
          <span className="text-xs opacity-85">Web版</span>
          <VersionInput
            label="個別"
            value={versionSettings.individual}
            onChange={(individual) => setVersionSettings((v) => ({ ...v, individual }))}
          />
          <VersionInput
            label="正式"
            value={versionSettings.official}
            onChange={(official) => setVersionSettings((v) => ({ ...v, official }))}
          />
        </div>
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
                await downloadBundle(versionSettings);
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
        {/* 表示倍率（縮小・拡大・全体表示・標準に戻す） */}
        <div className="ml-auto flex items-center gap-1 self-center pr-1 text-xs text-slate-600">
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
        <button
          onClick={() => {
            if (confirm("すべての入力と図面を初期状態に戻します。よろしいですか？")) {
              skipNextAutosave();
              resetDefaults();
              clearDrawings();
              clearDraft();
              flash("初期化しました");
            }
          }}
          className="px-3 py-2 text-xs self-center"
          style={{ color: "#666" }}
        >
          ↺ 初期化
        </button>
      </div>

      {/* グリッド */}
      <main ref={mainRef} className="flex-1 overflow-hidden p-3" style={{ background: "#eef0f2" }}>
        <SheetGrid
          sheetName={active}
          model={model.sheets[active]}
          faithful={active === "評価シート"}
          interactiveDrawings={active === "評価シート"}
          versionSettings={versionSettings}
          scale={scale}
        />
      </main>

        {/* PDF捕捉用（オフスクリーン・常時描画） */}
        <ReportFrame versionSettings={versionSettings} />
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
          className="fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-sm"
          style={{ background: "#222", color: "#fff" }}
        >
          {msg}
        </div>
      )}
    </>
  );
}
