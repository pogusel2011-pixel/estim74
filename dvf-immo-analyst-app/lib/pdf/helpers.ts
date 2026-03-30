import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, Color } from "pdf-lib";

// ─── A4 dimensions & layout constants ────────────────────────────────────────
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const ML = 40;  // margin left
export const MR = 40;  // margin right
export const MT = 44;  // margin top
export const MB = 48;  // margin bottom
export const CW = PAGE_W - ML - MR; // content width = 515.28pt

// ─── Color palette ────────────────────────────────────────────────────────────
export const C = {
  blue:        rgb(37 / 255, 99 / 255, 235 / 255),   // #2563EB
  darkBlue:    rgb(29 / 255, 78 / 255, 216 / 255),   // #1D4ED8
  white:       rgb(1, 1, 1),
  dark:        rgb(17 / 255, 24 / 255, 39 / 255),    // #111827
  gray:        rgb(107 / 255, 114 / 255, 128 / 255), // #6B7280
  lightGray:   rgb(156 / 255, 163 / 255, 175 / 255), // #9CA3AF
  border:      rgb(229 / 255, 231 / 255, 235 / 255), // #E5E7EB
  borderBlue:  rgb(191 / 255, 219 / 255, 254 / 255), // #BFDBFE
  lightBlueBg: rgb(239 / 255, 246 / 255, 255 / 255), // #EFF6FF
  coverBg:     rgb(219 / 255, 234 / 255, 254 / 255), // #DBEAFE — light sky blue for cover
  headerBg:    rgb(248 / 255, 250 / 255, 252 / 255), // #F8FAFC
  rowAlt:      rgb(249 / 255, 250 / 255, 251 / 255), // #F9FAFB
  green:       rgb(22 / 255, 163 / 255, 74 / 255),   // #16A34A
  greenBg:     rgb(240 / 255, 253 / 255, 244 / 255), // #F0FDF4
  greenBorder: rgb(187 / 255, 247 / 255, 208 / 255), // #BBF7D0
  red:         rgb(220 / 255, 38 / 255, 38 / 255),   // #DC2626
  amber:       rgb(180 / 255, 83 / 255, 9 / 255),    // #B45309
  amberBg:     rgb(255 / 255, 251 / 255, 235 / 255), // #FFFBEB
  orangeBg:    rgb(255 / 255, 247 / 255, 237 / 255), // #FFF7ED
};

// ─── Font sizes ───────────────────────────────────────────────────────────────
export const FS = {
  cover_title: 26,
  cover_sub:   13,
  h1:          10,  // section heading (uppercase)
  body:        10,
  small:       8.5,
  micro:       7.5,
  table:       8.5,
  table_head:  7.5,
};

// ─── Text sanitization ───────────────────────────────────────────────────────
/**
 * Converts non-WinAnsi chars to safe equivalents for pdf-lib StandardFonts.
 * French accents (é è ê à â ù û ç î ô etc.) are in WinAnsi 0xC0-0xFF — kept as-is.
 * Euro sign U+20AC maps to WinAnsi 0x80 — kept as-is.
 * Superscript ² U+00B2 is in Latin-1/WinAnsi — kept as-is.
 */
export function san(text: string | null | undefined): string {
  if (text == null) return "";
  return String(text)
    .replace(/\u0152/g, "OE") // Œ
    .replace(/\u0153/g, "oe") // œ
    .replace(/\u00C6/g, "AE") // Æ
    .replace(/\u00E6/g, "ae") // æ
    .replace(/[✓✔☑✅]/g, "+")
    .replace(/[✗✘❌]/g, "-")
    .replace(/[⚠⚡⛔]/g, "!")
    .replace(/[★☆]/g, "*")
    .replace(/[→⟶➜➡]/g, "->")
    .replace(/\u2191/g, "^")    // ↑
    .replace(/\u2193/g, "v")    // ↓
    .replace(/[•·]/g, "-")
    .replace(/\u2019/g, "\u2019") // right single quote — in WinAnsi 0x92
    .replace(/\u2018/g, "\u2018") // left single quote — in WinAnsi 0x91
    .replace(/\u201C/g, "\u201C") // left double quote — in WinAnsi 0x93
    .replace(/\u201D/g, "\u201D") // right double quote — in WinAnsi 0x94
    .replace(/\u2013/g, "-")    // en dash
    .replace(/\u2014/g, "-")    // em dash
    .replace(/\u00A0/g, " ")   // non-breaking space
    .replace(/\u202F/g, " ")   // narrow no-break space
    .replace(/\u2009/g, " ")   // thin space
    .replace(/[\u0100-\u017E]/g, (c) => {
      // Decompose common Latin Extended-A chars not in WinAnsi
      const map: Record<string, string> = {
        "\u0141": "L", "\u0142": "l", "\u0160": "S", "\u0161": "s",
        "\u017D": "Z", "\u017E": "z", "\u0178": "Y",
      };
      return map[c] ?? c.normalize("NFD").replace(/[\u0300-\u036F]/g, "");
    });
}

// ─── Number formatting — regular space as thousands separator (WinAnsi-safe) ─
/** Format integer with regular space as thousands separator. Exported for builders. */
export function numFr(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
export function fPrice(amount: number | null | undefined): string {
  if (amount == null) return "-";
  return numFr(Math.round(amount)) + " \u20AC";
}
export function fPsm(psm: number | null | undefined): string {
  if (psm == null) return "-";
  return numFr(Math.round(psm)) + " \u20AC/m\u00B2";
}
export function fPct(factor: number): string {
  return (factor >= 0 ? "+" : "") + (factor * 100).toFixed(1) + "%";
}
export function fDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", { month: "2-digit", year: "numeric" });
  } catch { return dateStr; }
}

/** Normalise "30avenue des Fleurs" → "30 avenue des Fleurs" */
export function normalizeAddr(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/^(\d+[A-Za-z]?)([A-Za-zÀ-ÖØ-öø-ÿ])/, "$1 $2");
}

// ─── Font bundle ──────────────────────────────────────────────────────────────
export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}
export async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  const [regular, bold, italic] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.HelveticaOblique),
  ]);
  return { regular, bold, italic };
}

// ─── Text width measurement ───────────────────────────────────────────────────
export function textW(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(san(text), size);
}

// ─── Word-wrap ────────────────────────────────────────────────────────────────
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const safe = san(text);
  if (!safe.trim()) return [""];
  // First split by hard newlines
  const paragraphs = safe.split(/\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.length > 0 ? lines : [""];
}

// ─── Page writer helper ───────────────────────────────────────────────────────
export class Writer {
  pdf: PDFDocument;
  fonts: Fonts;
  page!: PDFPage;
  y!: number; // current cursor (pdf coord, bottom-up)

  constructor(pdf: PDFDocument, fonts: Fonts) {
    this.pdf = pdf;
    this.fonts = fonts;
  }

  addPage(): PDFPage {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MT;
    return this.page;
  }

  /** Ensure at least `need` pts of space remain; add page if not */
  ensureSpace(need: number): void {
    if (this.y - need < MB) {
      this.addPage();
    }
  }

  /** Draw a filled rectangle (pdf coords: bottom-left origin) */
  rect(x: number, y: number, w: number, h: number, color: Color): void {
    this.page.drawRectangle({ x, y, width: w, height: h, color });
  }

  /** Draw a stroked rectangle (border only) */
  rectStroke(x: number, y: number, w: number, h: number, color: Color, thickness = 0.5): void {
    this.page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: thickness, opacity: 0 });
  }

  /** Draw a horizontal rule */
  hline(x: number, y: number, w: number, color: Color = C.border, thickness = 0.5): void {
    this.page.drawLine({ start: { x, y }, end: { x: x + w, y }, color, thickness });
  }

  /** Draw text at exact position */
  text(
    txt: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color: Color = C.dark
  ): void {
    const s = san(txt);
    if (!s) return;
    this.page.drawText(s, { x, y, font, size, color });
  }

  /** Draw text centered in a column (x = left edge, w = column width) */
  textCenter(txt: string, x: number, y: number, w: number, font: PDFFont, size: number, color: Color = C.dark): void {
    const s = san(txt);
    const tw = font.widthOfTextAtSize(s, size);
    const cx = x + (w - tw) / 2;
    this.page.drawText(s, { x: cx, y, font, size, color });
  }

  /** Draw text right-aligned (x = right edge) */
  textRight(txt: string, xRight: number, y: number, font: PDFFont, size: number, color: Color = C.dark): void {
    const s = san(txt);
    const tw = font.widthOfTextAtSize(s, size);
    this.page.drawText(s, { x: xRight - tw, y, font, size, color });
  }

  /**
   * Draw a section title with a blue top-border.
   * Returns the new y after the title.
   */
  sectionTitle(title: string): number {
    this.ensureSpace(28);
    // Blue top rule
    this.hline(ML, this.y, CW, C.blue, 2);
    this.y -= 12;
    this.text(san(title).toUpperCase(), ML, this.y, this.fonts.bold, FS.h1, C.blue);
    this.y -= 12;
    return this.y;
  }

  /** Draw a simple key: value row */
  kv(key: string, value: string, indent = 0): void {
    const lx = ML + indent;
    const rx = ML + CW;
    this.text(key, lx, this.y, this.fonts.regular, FS.body, C.gray);
    this.textRight(value, rx, this.y, this.fonts.bold, FS.body, C.dark);
    this.y -= FS.body * 1.6;
  }

  /** Draw footer on current page */
  footer(ref: string, today: string): void {
    const fy = MB - 14;
    this.hline(ML, fy + 10, CW, C.border);
    this.text(
      "ESTIM\u201974 - Estimation fond\u00E9e sur les prix sign\u00E9s DVF - Source DGFiP 2014-2024 - Usage professionnel",
      ML, fy, this.fonts.italic, FS.micro, C.lightGray
    );
    this.textRight(`Ref. ${ref} - ${today}`, ML + CW, fy, this.fonts.regular, FS.micro, C.lightGray);
  }

  /** Move cursor down by n points */
  gap(n: number): void {
    this.y -= n;
  }
}

// ─── Table drawing ────────────────────────────────────────────────────────────
export interface TableCol {
  header: string;
  width: number; // in points
  align?: "left" | "right" | "center";
  bold?: boolean;
  color?: (row: string[]) => Color;
  bgColor?: (row: string[]) => Color | null;
}

export interface TableOpts {
  cols: TableCol[];
  rows: string[][];
  rowHeight?: number;       // min row height in pts (default 14)
  headerSize?: number;
  bodySize?: number;
  cellPadX?: number;
  cellPadY?: number;
  stripedRows?: boolean;
  headerBg?: Color;
  showBorder?: boolean;
}

/**
 * Draws a table with auto page-break support.
 * Returns the final y cursor after the table.
 */
export function drawTable(writer: Writer, opts: TableOpts): void {
  const {
    cols,
    rows,
    rowHeight = 14,
    headerSize = FS.table_head,
    bodySize = FS.table,
    cellPadX = 5,
    cellPadY = 3,
    stripedRows = true,
    showBorder = true,
  } = opts;

  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const { regular, bold } = writer.fonts;

  function drawRow(
    y: number,
    cells: string[],
    isHeader: boolean,
    bgColor?: Color | null,
    rowH?: number
  ): number {
    const rh = rowH ?? rowHeight;
    const ry = y - rh;

    // Background
    if (bgColor) {
      writer.rect(ML, ry, totalW, rh, bgColor);
    }
    // Bottom border
    writer.hline(ML, ry, totalW, isHeader ? C.blue : C.border, isHeader ? 1 : 0.4);

    let cx = ML;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const cw = col.width;
      const cell = cells[i] ?? "";
      const font = isHeader ? bold : (col.bold ? bold : regular);
      const size = isHeader ? headerSize : bodySize;
      const color = isHeader ? C.blue : (col.color ? col.color(cells) : C.dark);
      const maxW = cw - cellPadX * 2;

      // Wrap text if needed
      const wrappedLines = wrapText(font, cell, size, maxW);
      const lineH = size * 1.35;
      const totalTextH = wrappedLines.length * lineH;
      const baseY = ry + rh - cellPadY - size;

      for (let li = 0; li < wrappedLines.length; li++) {
        const ly = baseY - li * lineH;
        const txt = san(wrappedLines[li]);
        if (!txt) continue;
        const tw = font.widthOfTextAtSize(txt, size);
        let tx = cx + cellPadX;
        if (col.align === "right") tx = cx + cw - cellPadX - tw;
        else if (col.align === "center") tx = cx + (cw - tw) / 2;
        if (ly > MB - 4) {
          writer.page.drawText(txt, { x: tx, y: ly, font, size, color });
        }
      }
      cx += cw;
    }

    return rh;
  }

  // ─── Calculate row heights upfront (handle text wrap) ───────────────────
  function calcRowH(cells: string[], size: number, font: PDFFont): number {
    let maxLines = 1;
    let cx2 = 0;
    for (let i = 0; i < cols.length; i++) {
      const cw = cols[i].width;
      const maxW = cw - cellPadX * 2;
      const lines = wrapText(font, cells[i] ?? "", size, maxW);
      maxLines = Math.max(maxLines, lines.length);
      cx2 += cw;
    }
    return Math.max(rowHeight, maxLines * size * 1.35 + cellPadY * 2);
  }

  // ─── Draw header ─────────────────────────────────────────────────────────
  const hdrH = calcRowH(cols.map((c) => c.header), headerSize, bold);
  writer.ensureSpace(hdrH + rowHeight); // at least 1 data row visible
  drawRow(writer.y, cols.map((c) => c.header), true, opts.headerBg ?? C.headerBg, hdrH);
  writer.y -= hdrH;

  // ─── Draw data rows ───────────────────────────────────────────────────────
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const rh = calcRowH(row, bodySize, regular);

    if (writer.y - rh < MB + 6) {
      writer.footer("...", "");
      writer.addPage();
      // Redraw header on new page
      writer.ensureSpace(hdrH + rowHeight);
      drawRow(writer.y, cols.map((c) => c.header), true, opts.headerBg ?? C.headerBg, hdrH);
      writer.y -= hdrH;
    }

    let bg: Color | null = null;
    if (row.__bg as unknown) {
      // custom bg set externally — not standard; skip
    } else if (stripedRows && ri % 2 === 1) {
      bg = C.rowAlt;
    }
    // Check for custom bgColor per col
    const colBg = cols.find((c) => c.bgColor)?.bgColor?.(row) ?? null;
    if (colBg) bg = colBg;

    drawRow(writer.y, row, false, bg, rh);
    writer.y -= rh;
  }
}
