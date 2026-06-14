"use client";
/**
 * 編集中データのドラフト自動保存（ブラウザ再読込・クラッシュ対策）。
 *  - 入力値・図面メタ（JSON）: localStorage（小さい・常に保存）
 *  - 図面画像（dataURLマップ）: IndexedDB（localStorage の容量制限を回避。
 *    失敗時は入力のみのドラフトに縮退）
 * 明示的な保存・読込・初期化で clearDraft() を呼びドラフトを破棄する。
 */
import { useEffect, useRef } from "react";
import { useEngineVersion } from "@/engine/store";
import { useDrawingsVersion, collectImages } from "@/drawings/store";
import { buildSaveFile, type SaveFile } from "@/lib/storage";

const DRAFT_KEY = "tatuene-draft:v1";
const DB_NAME = "tatuene-draft";
const STORE = "images";
const IMAGES_KEY = "images:v1";
const DEBOUNCE_MS = 2000;

// ---- IndexedDB 最小ヘルパー（依存追加なし） ----
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

// ---- ドラフト操作 ----
export interface Draft {
  data: SaveFile;
  images: Record<string, string>;
}

export async function saveDraft(): Promise<void> {
  let data: SaveFile;
  try {
    data = buildSaveFile();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    return; // プライベートモード等。自動保存は黙って諦める
  }
  try {
    await withStore("readwrite", (s) => s.put(collectImages(), IMAGES_KEY));
  } catch {
    // IndexedDB が使えない環境では入力のみのドラフトに縮退
  }
}

export async function loadDraft(): Promise<Draft | null> {
  let data: SaveFile;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    data = JSON.parse(raw) as SaveFile;
  } catch {
    return null;
  }
  let images: Record<string, string> = {};
  try {
    images = ((await withStore("readonly", (s) => s.get(IMAGES_KEY))) as Record<string, string> | undefined) ?? {};
  } catch {
    // 画像なしで復元
  }
  return { data, images };
}

// clearDraft のたびに増えるエポック。スケジュール済みの自動保存は
// 自分のエポックが古くなっていたら発火を取りやめる（保存直後の
// 残存デバウンスがドラフトを再作成するのを防ぐ）。
let draftEpoch = 0;

export function clearDraft(): void {
  draftEpoch++;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 無視
  }
  withStore("readwrite", (s) => s.delete(IMAGES_KEY)).catch(() => {});
}

let skipOnce = false;

/**
 * 直後の version 変化による自動保存を1回だけ抑止する。
 * 読込・初期化はそれ自体が version を上げるため、clearDraft() しても
 * 直後の自動保存でドラフトが再作成されてしまうのを防ぐ。
 */
export function skipNextAutosave(): void {
  skipOnce = true;
}

/**
 * 入力・図面の変更を購読してドラフトを自動保存する（2秒デバウンス）。
 * 初回マウント時の保存はスキップする（編集していないのにドラフトが残るのを防ぐ）。
 */
export function useDraftAutosave(): void {
  const engineV = useEngineVersion();
  const drawingsV = useDrawingsVersion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (skipOnce) {
      skipOnce = false;
      return;
    }
    const myEpoch = draftEpoch;
    const timer = setTimeout(() => {
      if (myEpoch !== draftEpoch) return; // この保存予約より後に clearDraft された
      void saveDraft();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [engineV, drawingsV]);
}
