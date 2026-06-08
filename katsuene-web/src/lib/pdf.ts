"use client";
/** 評価シート(帳票)を横向きA4のPDFとして書き出す。
 *  jsPDF / html2canvas-pro はサイズが大きいため、出力時にのみ動的読込する。 */

export async function exportReportPdf(node: HTMLElement, title: string): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
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
  pdf.save(`かつエネ断熱_評価シート_${safe}.pdf`);
}
