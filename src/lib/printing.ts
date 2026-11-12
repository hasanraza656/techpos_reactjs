export function printElement(
  element: HTMLElement | null,
  width: "58" | "80" | "a4" = "80",
) {
  if (!element)
    throw new Error("Open a receipt or shortcut guide before printing.");
  const frame = document.createElement("iframe");
  frame.title = "Print preview";
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("The browser could not open print preview.");
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Tech POS print</title><style>@page{size:${width === "a4" ? "A4" : width + "mm auto"};margin:${width === "a4" ? "15mm" : "3mm"}}body{font:12px ui-monospace,monospace;color:#111;background:white;margin:0;max-width:${width === "a4" ? "180mm" : Number(width) - 6 + "mm"}}h2{text-align:center;font-size:17px}p{line-height:1.5}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 0;font-size:11px}small{font-size:10px}.receipt-total{font-size:18px;font-weight:bold}.receipt-rule{border-top:1px dashed #333;margin:12px 0}.receipt-status{font-weight:bold;border:1px solid #333;padding:8px}button{display:none}</style></head><body>${element.outerHTML}</body></html>`,
  );
  doc.close();
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("Print preview is unavailable.");
  }
  win.onafterprint = () => frame.remove();
  try {
    win.focus();
    win.print();
  } catch {
    frame.remove();
    throw new Error(
      "The print dialog could not open. Check browser printing permissions and your selected printer.",
    );
  }
  return true;
}
