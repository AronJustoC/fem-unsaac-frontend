/**
 * High-resolution PNG export for the matrix inspectors.
 *
 * The tables are painted straight onto a canvas from the rendered DOM (cell
 * geometry, colors and fonts come from the live styles), so the exported image
 * matches what the user sees without pulling in a DOM-to-image dependency.
 */

const PIXEL_SCALE = 3;
const PADDING = 18;
const TITLE_HEIGHT = 34;

const isDarkTheme = () => document.documentElement.classList.contains("dark");

const isTransparent = (color: string) =>
  !color || color === "transparent" || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color);

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadCanvasPng = (canvas: HTMLCanvasElement | null, fileName: string) => {
  canvas?.toBlob((blob) => {
    if (blob) saveBlob(blob, fileName);
  }, "image/png");
};

export const downloadTablePng = (
  table: HTMLTableElement | null,
  fileName: string,
  title?: string,
) => {
  if (!table) return;

  const tableRect = table.getBoundingClientRect();
  // The table may be visually shrunk to fit the screen; undo that factor so the
  // export always uses natural, full-resolution geometry.
  const viewScale = tableRect.width / table.offsetWidth || 1;
  const tableWidth = table.offsetWidth;
  const tableHeight = table.offsetHeight;
  const titleOffset = title ? TITLE_HEIGHT : 0;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round((tableWidth + PADDING * 2) * PIXEL_SCALE);
  canvas.height = Math.round((tableHeight + titleOffset + PADDING * 2) * PIXEL_SCALE);
  const context = canvas.getContext("2d");
  if (!context) return;

  const dark = isDarkTheme();
  context.scale(PIXEL_SCALE, PIXEL_SCALE);
  context.fillStyle = dark ? "#0B0F1A" : "#FFFFFF";
  context.fillRect(0, 0, tableWidth + PADDING * 2, tableHeight + titleOffset + PADDING * 2);
  context.textBaseline = "middle";

  if (title) {
    context.fillStyle = dark ? "#F9FAFB" : "#111827";
    context.font = "700 15px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(title, PADDING, PADDING + TITLE_HEIGHT / 2);
  }

  const gridColor = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  context.lineWidth = 0.5;

  table.querySelectorAll<HTMLTableCellElement>("th, td").forEach((cell) => {
    const cellRect = cell.getBoundingClientRect();
    const x = (cellRect.left - tableRect.left) / viewScale + PADDING;
    const y = (cellRect.top - tableRect.top) / viewScale + PADDING + titleOffset;
    const width = cellRect.width / viewScale;
    const height = cellRect.height / viewScale;
    const style = window.getComputedStyle(cell);

    if (!isTransparent(style.backgroundColor)) {
      context.fillStyle = style.backgroundColor;
      context.fillRect(x, y, width, height);
    }

    context.strokeStyle = gridColor;
    context.strokeRect(x, y, width, height);

    const text = cell.textContent?.trim();
    if (!text) return;

    context.fillStyle = style.color;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const align = style.textAlign;
    if (align === "right" || align === "end") {
      context.textAlign = "right";
      context.fillText(text, x + width - 6, y + height / 2);
    } else if (align === "center") {
      context.textAlign = "center";
      context.fillText(text, x + width / 2, y + height / 2);
    } else {
      context.textAlign = "left";
      context.fillText(text, x + 6, y + height / 2);
    }
  });

  canvas.toBlob((blob) => {
    if (blob) saveBlob(blob, fileName);
  }, "image/png");
};
