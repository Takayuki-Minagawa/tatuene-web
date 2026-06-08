"use client";
import React, { useRef, useState } from "react";
import SheetGrid from "@/components/SheetGrid";
import CheckPanel from "@/components/CheckPanel";
import Manual from "@/components/Manual";
import ReportFrame, { REPORT_FRAME_ID } from "@/components/ReportFrame";
import { engine, resetDefaults } from "@/engine/store";
import { clearAll as clearDrawings } from "@/drawings/store";
import { downloadBundle, loadFile } from "@/lib/storage";
import { validate, type Issue } from "@/engine/validate";
import { exportReportPdf } from "@/lib/pdf";

export default function Home() {
  const model = engine().model;
  const sheets = model.sheetOrder;
  const [active, setActive] = useState(sheets[0]);
  const [msg, setMsg] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [showManual, setShowManual] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }

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
      await loadFile(f);
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
        <span className="font-bold text-lg">かつエネ断熱シミュレーター</span>
        <span className="text-xs opacity-80">Web版 Ver.1.7.6</span>
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
        <button
          onClick={() => {
            if (confirm("すべての入力と図面を初期状態に戻します。よろしいですか？")) {
              resetDefaults();
              clearDrawings();
              flash("初期化しました");
            }
          }}
          className="ml-auto px-3 py-2 text-xs self-center"
          style={{ color: "#666" }}
        >
          ↺ 初期化
        </button>
      </div>

      {/* グリッド */}
      <main className="flex-1 overflow-hidden p-3" style={{ background: "#eef0f2" }}>
        <SheetGrid
          sheetName={active}
          model={model.sheets[active]}
          faithful={active === "評価シート"}
          interactiveDrawings={active === "評価シート"}
        />
      </main>

        {/* PDF捕捉用（オフスクリーン・常時描画） */}
        <ReportFrame />
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
