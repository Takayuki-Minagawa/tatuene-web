"use client";
/**
 * 計算エンジンのアプリ全体シングルトン + React購読ストア。
 * 入力変更で version を進め、購読中のコンポーネントを再描画する。
 */
import { useSyncExternalStore } from "react";
import { getEngine, WorkbookEngine } from "./workbook";

let _engine: WorkbookEngine | null = null;
export function engine(): WorkbookEngine {
  if (!_engine) _engine = getEngine();
  return _engine;
}

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function snapshot() {
  return version;
}

/** 入力変更を購読（再計算の反映トリガ）。返り値は version 番号。 */
export function useEngineVersion(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * 1セルの入力生値だけを購読する（セル単位の細粒度購読）。
 * 返り値はプリミティブなので、その値が変わったセルのみ再描画される。
 */
export function useInputValue(sheet: string, addr: string): any {
  const read = () => engine().getInputRaw(sheet, addr);
  return useSyncExternalStore(subscribe, read, read);
}

/** 1セルの表示文字列（数式結果の整形済み）だけを購読する。 */
export function useDisplay(sheet: string, addr: string): string {
  const read = () => engine().getDisplay(sheet, addr);
  return useSyncExternalStore(subscribe, read, read);
}

export function setInput(sheet: string, addr: string, value: string | number | null) {
  engine().setInput(sheet, addr, value);
  emit();
}
export function applyInputs(map: Record<string, string | number>) {
  engine().applyInputs(map);
  emit();
}
export function resetDefaults() {
  engine().resetToDefaults();
  emit();
}
export function bump() {
  emit();
}
