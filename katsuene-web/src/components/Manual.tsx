"use client";
/** 操作マニュアル（アプリ内ヘルプ）。ヘッダーの「使い方」から開く。 */
import React from "react";
import { useModalA11y } from "./useModalA11y";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3
        className="text-sm font-bold mb-2 pl-2"
        style={{ color: "var(--head)", borderLeft: "4px solid var(--head)" }}
      >
        {title}
      </h3>
      <div className="text-[13px] leading-relaxed text-gray-800 space-y-1.5">{children}</div>
    </section>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs mr-1"
      style={{ background: color, border: "1px solid #00000020" }}
    >
      {label}
    </span>
  );
}

export default function Manual({ onClose }: { onClose: () => void }) {
  const { panelRef, closeBtnRef, onKeyDown } = useModalA11y(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
        className="bg-white rounded-lg shadow-2xl w-[760px] max-w-[94vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div
          id="manual-title"
          className="px-5 py-3 rounded-t-lg text-white font-bold flex items-center"
          style={{ background: "var(--head)" }}
        >
          操作マニュアル — かつエネ断熱シミュレーター Web版
          <button
            ref={closeBtnRef}
            className="ml-auto text-white text-xl leading-none"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-auto">
          <Section title="１．このツールについて">
            <p>
              木造住宅の局所的（ひと部屋）な断熱改修の効果を簡易に判定するツールです。
              入力すると、Excel版「かつエネ断熱シミュレーター」と<strong>同一の計算式</strong>で
              自動計算され、診断帳票（評価シート）をPDFで出力できます。
            </p>
          </Section>

          <Section title="２．画面の見方（タブとセルの色）">
            <p>上部のタブで5つのシートを切り替えます。</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>表紙</strong>：工事名・住所・建築年・診断者などの基本情報</li>
              <li><strong>計算シート（現状）</strong>：寸法・開口部・各部位の建材（主な入力）</li>
              <li><strong>計算シート（改修後）</strong>：改修する部位の建材と断熱改修面積</li>
              <li><strong>評価シート</strong>：診断結果（PDF帳票の本体）</li>
              <li><strong>部材性能シート</strong>：建材マスタ（必要に応じ編集可）</li>
            </ul>
            <p className="mt-2">セルの色で役割が分かります。</p>
            <p>
              <Chip color="#fffdf2" label="クリーム = 入力欄" />
              <Chip color="#eef4ff" label="青 = 自動計算（編集不可）" />
              <Chip color="#ffffff" label="白/無色 = 見出し・固定値" />
            </p>
          </Section>

          <Section title="３．入力の手順">
            <ol className="list-decimal pl-5 space-y-1">
              <li><strong>表紙</strong>で工事名・住所・場所・建築年・診断者を入力。</li>
              <li>
                <strong>計算シート（現状）</strong>で、基本データ（床面積・外壁面長さ・天井高さ 等）、
                開口部（窓／外部ドア／室内ドアの W・H）、各部位の建材を
                <strong>ドロップダウンから選択</strong>します。
              </li>
              <li>
                <strong>計算シート（改修後）</strong>で、改修する部位の建材を選び、
                <strong>断熱改修面積</strong>を入力します。
              </li>
              <li><strong>評価シート</strong>で結果を確認し、PDFを出力します。</li>
            </ol>
          </Section>

          <Section title="４．記入上の注意（重要）">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>クリーム色のセルのみ</strong>入力できます。青いセルは自動計算です。</li>
              <li>各部の建材で使わない欄は、空欄にせず必ず<strong>「無し」</strong>を選択してください。</li>
              <li>
                改修後シートの<strong>断熱改修面積は、改修する部位の面積のみ</strong>を記入します。
                <strong style={{ color: "#b3261e" }}>面積を入れないと、建材を選んでも計算に反映されません。</strong>
              </li>
              <li>気密性能の「換気回数」は、建物の年代を参考に選択してください。</li>
              <li>一つの部位に複数仕様がある場合は、大部分を占める仕様を記入します。</li>
              <li>
                隙間改善工事は、床・壁・天井・建具のうち2つ改善で1UP、3つで2UP、4つで3UP
                （C値5を上限）として扱います。
              </li>
            </ul>
          </Section>

          <Section title="５．図面の挿入（現状図・改修図）">
            <p>
              評価シートの<strong>◇現状図／◇改修図</strong>、および下部の図枠には、
              <strong>図面画像をアップロードして配置・注釈</strong>できます。出力するPDF帳票にもそのまま反映されます。
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>画像</strong>：図面（写真・スキャン等）をアップロードします。枠に合わせて自動配置されます。</li>
              <li><strong>選択</strong>：画像や注釈をドラッグで移動。注釈を選んで<strong>Delete</strong>キーまたは「注釈削除」で消せます。</li>
              <li><strong>拡・回</strong>のスライダーで画像の<strong>拡大縮小・回転</strong>を調整できます。</li>
              <li><strong>直線／矢印／丸数字／文字</strong>：検定位置などを書き込めます（色・線の太さを選択可）。丸数字は自動で連番になります。</li>
              <li>1つの枠には1つの図面のみ。差し替えるときは<strong>「図面削除」</strong>で消してから再アップロードしてください。</li>
            </ul>
          </Section>

          <Section title="６．保存と読み込み">
            <p>
              <strong>💾 保存</strong>で入力内容と図面を1つの<strong>ZIPファイル</strong>に保存、
              <strong>📂 読込</strong>で復元できます（画像はZIP内に個別ファイルとして同梱されます）。
              図面のない旧形式のJSONファイルも読み込めます。
            </p>
          </Section>

          <Section title="７．データチェック">
            <p>
              <strong>✓ データチェック</strong>で入力の不備を確認できます。
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>
                <span style={{ color: "#b3261e", fontWeight: 700 }}>エラー</span>
                ：必須項目の未入力や不正な数値など。PDF出力前に修正が必要です。
              </li>
              <li>
                <span style={{ color: "#8a5a12", fontWeight: 700 }}>警告</span>
                ：開口部のW/H片方のみ入力など。確認の上、そのまま出力もできます。
              </li>
            </ul>
            <p>項目をクリックすると該当シートへ移動します。</p>
          </Section>

          <Section title="８．PDF帳票の出力">
            <p>
              <strong>⬇ PDF帳票</strong>を押すと、評価シートを<strong>横向きA4のPDF</strong>として
              ダウンロードします。エラーがある場合は出力前に確認画面が表示されます。
            </p>
          </Section>

          <Section title="９．補足・制限">
            <ul className="list-disc pl-5 space-y-0.5">
              <li>評価シートの「現状図／改修図」欄は、上記「５．図面の挿入」で図面を貼り付けられます（任意）。</li>
              <li>スマートフォンでは表を横スクロールして入力できます（快適なのはPC・タブレットです）。</li>
              <li>建材マスタ（部材性能シート）はユーザーが追加・修正でき、内容は保存ファイルに含まれます。</li>
            </ul>
          </Section>
        </div>

        <div className="px-5 py-3 border-t flex justify-end">
          <button
            className="toolbar-btn"
            style={{ background: "var(--head)", color: "#fff" }}
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
