"use client";
/** 評価シート(帳票)を横向きA4のPDFとして書き出す。
 *  jsPDF / html2canvas-pro はサイズが大きいため、出力時にのみ動的読込する。 */

export async function exportReportPdf(node: HTMLElement, title: string): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);

  // ブラウザの canvas 寸法上限（各社で異なるが概ね16k〜）を超えると、html2canvas が
  // 空/切れた画像を返し欠損PDFになる。上限を超えないよう倍率を自動的に下げる。
  const MAX_CANVAS_PX = 16384;
  const preferredScale = 2;
  const w0 = node.scrollWidth || node.offsetWidth || 1;
  const h0 = node.scrollHeight || node.offsetHeight || 1;
  const fitScale = Math.min(MAX_CANVAS_PX / w0, MAX_CANVAS_PX / h0);
  const scale = Math.max(1, Math.min(preferredScale, fitScale));

  const canvas = await html2canvas(node, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  if (!canvas.width || !canvas.height) {
    throw new Error("帳票の描画に失敗しました（内容が大きすぎる可能性があります）。表示を確認して再度お試しください。");
  }
  const img = canvas.toDataURL("image/jpeg", 0.92);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const availW = pw - margin * 2;
  const availH = ph - margin * 2;

  const ratio = canvas.width / canvas.height;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }
  const x = (pw - w) / 2;
  const y = (ph - h) / 2;
  pdf.addImage(img, "JPEG", x, y, w, h);

  const safe = (title || "診断").replace(/[\\/:*?"<>|]/g, "_");
  pdf.save(`達エネ断熱_評価シート_${safe}.pdf`);
}
