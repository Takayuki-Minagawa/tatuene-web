# かつエネ断熱シミュレーター Web版

木造住宅ひと部屋断熱改修の効果を簡易判定する「かつエネ断熱シミュレーター」のWeb版（辰の達人診断ユーザー向け）。

## 設計の核（重要）

**Excel原本の数式を一切書き換えず、そのまま計算エンジンで動かす。** 計算ロジックは再実装しない
（作成者との契約・東京都評価との同一性を担保）。フォームUIは値の入出力先セルに繋ぐだけ。

- 計算エンジン: [HyperFormula](https://hyperformula.handsontable.com/)（Excel数式をそのまま再計算）
- 数式抽出: `data/Web版_かつエネ断熱シミュレーターVer1-7-6.xlsx` → `src/data/workbook-model.json`
- 忠実性検証: Excelのキャッシュ計算値とJS再計算結果を全数式セルで突合（879/885一致。残6件は
  原本由来の壊れた `#REF!` 数式で、Excel自身も `#VALUE!` エラー＝帳票に影響なし）

## 構成

| シート | 役割 |
|---|---|
| 表紙 | 物件メタ情報入力＋表紙 |
| 計算シート（現状） | 寸法・開口部・建材選択（主入力） |
| 計算シート（改修後） | 改修部位・建材・面積 |
| 評価シート | 診断帳票（PDF出力の本体・横向きA4・Excel忠実再現） |
| 部材性能シート | 建材マスタ（VLOOKUP参照元・編集可） |

### 主なファイル
- `scripts/extract-workbook.py` — Excel → モデルJSON・建材マスタ・挿絵画像・図面枠・キャッシュ値 を抽出
- `scripts/fidelity-check.ts` — 忠実性検証（Excel値 vs JS再計算）
- `src/engine/transform.ts` — 計算結果を変えない機械的変換（ASCIIシート別名・`TRUE()/FALSE()`）
- `src/engine/workbook.ts` — HyperFormulaラッパ（入力/計算/表示形式/保存復元）
- `src/engine/validate.ts` — データチェック
- `src/components/SheetGrid.tsx` — Excel風グリッドフォーム（結合・罫線・塗り・ドロップダウン・挿絵/図面枠の重ね描画）
- `src/components/DrawingEditor.tsx` — 図面枠の編集器（アップロード・移動/拡大縮小/回転・直線/矢印/丸数字/テキスト注釈）
- `src/drawings/store.ts` — 図面の状態ストア（計算エンジンとは独立。画像はメモリ上dataURL、座標は枠ローカルpx）
- `src/components/ReportFrame.tsx` + `src/lib/pdf.ts` — 評価シート（挿絵・図面を含む）のPDF出力
- `src/lib/storage.ts` — 保存/読込。保存はZIPバンドル（`katsuene.json`＝入力値・図面メタ ＋ `assets/`＝図面画像）、読込は `.zip`/`.json` 両対応

## 開発

```bash
npm install
npm run dev          # 開発サーバー http://localhost:3000
```

### Excelを差し替えたとき（数式・建材を更新）
```bash
npm run extract      # data/ のExcelから各種JSON・画像を再生成（要 python3 + openpyxl）
npm run fidelity     # 忠実性検証（Excel値と一致するか）
```

### ビルド（静的書き出し）
```bash
npm run build        # out/ に完全静的サイトを生成（output: export）
```
`out/` をそのまま任意のWebサーバー/静的ホスティング（社内サーバー, S3, Netlify, Vercel等）に配置。
サーバー側処理は不要。サブディレクトリ配信にも対応（`trailingSlash: true`）。

## 使い方
1. 各タブに入力（白いセルが入力欄。建材はドロップダウン）。計算セル（青）は自動更新。
2. 評価シートの「現状図／改修図」等の図枠に図面画像をアップロードし、移動/拡大縮小/回転や
   直線・矢印・丸数字・テキストの注釈を付けられる（1枠1図面、「図面削除」で差し替え）。
3. 「💾 保存」で入力＋図面をZIPファイルに保存、「📂 読込」で復元（`.zip`/旧`.json`対応）。
4. 「✓ データチェック」で不備を確認。
5. 「⬇ PDF帳票」で評価シート（挿絵・図面を含む）を横向きA4のPDFとしてダウンロード（エラーがあると出力前に警告）。

## 既知の制限
- 原本由来の壊れた `#REF!` セル（窓・西方位の日射取得率）は原本どおりエラー表示（帳票に影響なし）。
- 図面枠の位置はExcel原本のEMFアンカーから抽出している。Excelを差し替えた際は `npm run extract` 後に配置を目視確認すること。
- スマホは横スクロールで入力可。最適化はPC/タブレット。
