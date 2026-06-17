"use client";

/*
 * ============================================================================
 *  一時的なパスワードゲート（テスト公開期間中のみ）
 * ----------------------------------------------------------------------------
 *  ⚠️ これはクライアント側だけの簡易的な「目隠し」です。本当のアクセス制御では
 *     ありません（パスワード文字列は公開バンドル/ソースに含まれ、JS無効化や
 *     view-source で回避可能）。機密情報の保護用途には使わないでください。
 *
 *  ▼ 取り外し方（テスト終了後）
 *     1. このファイル（PasswordGate.tsx）を削除する
 *     2. src/app/layout.tsx から以下の2箇所を削除する
 *        - `import PasswordGate from "@/components/PasswordGate";`
 *        - <body> 内の <PasswordGate> ... </PasswordGate> ラッパー
 *           （中の {children} はそのまま残す）
 * ============================================================================
 */

import React, { useEffect, useState } from "react";

const PASSWORD = "ebi-ken";
const STORAGE_KEY = "tatuene-gate-unlocked";

export default function PasswordGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  // 同一セッション内で一度解除したら再入力を省く（タブを閉じると再ロック）。
  // SSRプリレンダは必ず unlocked=false なので、sessionStorage の読込は
  // ハイドレーション整合のためマウント後の一回限りに限定する（意図的な effect 内 setState）。
  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnlocked(true);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } else {
      setError(true);
      setInput("");
    }
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full flex-1 flex items-center justify-center bg-slate-100 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-md flex flex-col gap-4"
      >
        <h1 className="text-lg font-semibold text-slate-800">
          達エネ断熱シミュレーター
        </h1>
        <p className="text-sm text-slate-500">
          テスト公開中です。パスワードを入力してください。
        </p>
        <input
          type="password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(false);
          }}
          autoFocus
          aria-label="パスワード"
          aria-invalid={error}
          className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-500"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            パスワードが正しくありません。
          </p>
        )}
        <button
          type="submit"
          className="rounded-md bg-slate-800 px-4 py-2 text-base font-medium text-white hover:bg-slate-700"
        >
          開く
        </button>
      </form>
    </div>
  );
}
