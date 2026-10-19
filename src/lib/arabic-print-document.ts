/** Shared RTL print shell — load Arabic font before print to avoid broken PDF saves. */

export const ARABIC_PRINT_FONT_LINKS = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
`;

export const ARABIC_PRINT_BASE_CSS = `
html { direction: rtl; }
body { direction: rtl; unicode-bidi: isolate; text-rendering: optimizeLegibility; }
`;

export const ARABIC_PRINT_ONLOAD_SCRIPT = `
<script>
async function __arabicPrintWhenReady() {
  try {
    if (document.fonts && document.fonts.load) {
      await document.fonts.load('400 16px "Noto Naskh Arabic"');
      await document.fonts.load('700 16px "Noto Naskh Arabic"');
      await document.fonts.ready;
    }
  } catch (e) {}
  setTimeout(function () { window.print(); }, 200);
}
window.addEventListener("load", function () { void __arabicPrintWhenReady(); });
</script>
`;

export function openArabicPrintHtml(html: string) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("popup-blocked");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
