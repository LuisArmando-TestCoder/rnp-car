import type { RnpVehicleData } from "./rnp";
import { buildVehicleReport, type ReportFill } from "./report";
import { LOGO_DATA_URI } from "./logo";

export type ReportLineKind = "h1" | "sub" | "h2" | "p" | "blank" | "sig" | "table";
export interface ReportLine {
  kind: ReportLineKind;
  text?: string;
  rows?: Array<[string, string]>;
}

const HEADINGS = new Set([
  "Características de vehículo:", "Introducción:", "Lugar y fecha del Peritaje:",
  "Objeto del Peritaje:", "Resumen Ejecutivo:", "Glosario:", "Verificaciones iniciales:",
  "Metodología y Hallazgos:", "Documentación audiovisual.", "Resumen de los Hallazgos:",
  "Explicaciones Técnicas Complementarias:", "CONCLUSIONES:",
]);

function isHeading(t: string): boolean {
  return HEADINGS.has(t) || /^[A-ZÁÉÍÓÚÜÑ0-9 ]+:$/.test(t);
}

export function buildReportLines(v: RnpVehicleData, fill: ReportFill): ReportLine[] {
  const lines = buildVehicleReport(v, fill).split("\n");
  const out: ReportLine[] = [];
  let inChars = false;
  let rows: Array<[string, string]> = [];

  const flushRows = () => {
    if (rows.length) { out.push({ kind: "table", rows }); rows = []; }
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (i === 0) { out.push({ kind: "h1", text: line }); return; }
    if (line.startsWith("Placas ")) { out.push({ kind: "sub", text: line }); return; }
    if (line === "Características de vehículo:") { inChars = true; out.push({ kind: "h2", text: line }); return; }
    if (line.startsWith("San José,")) { inChars = false; flushRows(); out.push({ kind: "p", text: line }); return; }
    if (inChars) {
      const m = /^(.+?): (.+)$/.exec(line);
      if (m) { rows.push([m[1], m[2]]); } else if (line) { flushRows(); out.push({ kind: "p", text: line }); }
      return;
    }
    if (!line) { out.push({ kind: "blank" }); return; }
    if (line.startsWith("Aquí van fotos")) { out.push({ kind: "h2", text: line }); return; }
    if (isHeading(line)) { out.push({ kind: "h2", text: line }); return; }
    if (line === "Suscribe," || line.startsWith("____")) { out.push({ kind: "sig", text: line }); return; }
    if (line.startsWith("Lic. ") || line.startsWith("Perito ") || line.startsWith("Carnet ")) { out.push({ kind: "sig", text: line }); return; }
    out.push({ kind: "p", text: line });
  });
  flushRows();
  return out;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

export function renderReportHtml(v: RnpVehicleData, fill: ReportFill): string {
  const lines = buildReportLines(v, fill);
  const parts: string[] = [];
  for (const l of lines) {
    if (l.kind === "h1") parts.push(`<h1>${esc(l.text || "")}</h1>`);
    else if (l.kind === "sub") parts.push(`<p class="sub">${esc(l.text || "")}</p>`);
    else if (l.kind === "h2") parts.push(`<h2>${esc(l.text || "")}</h2>`);
    else if (l.kind === "blank") parts.push(`<div class="sp"></div>`);
    else if (l.kind === "sig") parts.push(`<p class="sig">${esc(l.text || "")}</p>`);
    else if (l.kind === "table" && l.rows) {
      // Render the characteristics fields as plain lines separated by break
      // lines (no table, no bullets, no numbering).
      for (const [k, val] of l.rows) {
        parts.push(`<p class="char"><strong>${esc(k)}:</strong> ${esc(val)}</p>`);
      }
    } else parts.push(`<p>${esc(l.text || "")}</p>`);
  }
  const css = `
    @page {
      size: Letter;
      margin: 26mm 24mm 24mm 24mm;
      @top-right { content: element(header); }
      @bottom-left { content: element(footer-left); }
      @bottom-right { content: element(footer-right); }
      @bottom-center { content: element(footer-center); }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; font-size: 12pt; }
    .header { position: running(header); text-align: right; padding-bottom: 2mm; }
    .header img { width: 18mm; height: 18mm; object-fit: contain; }
    .header hr { border: none; border-top: 1.5pt solid #1a1a1a; margin: 1.5mm 0 0; }
    .footer-left { position: running(footer-left); font-size: 9pt; color: #333; }
    .footer-right { position: running(footer-right); font-size: 9pt; color: #333; text-align: right; }
    .footer-center { position: running(footer-center); font-size: 9pt; color: #333; text-align: center; }
    h1 { font-size: 26pt; letter-spacing: 0.02em; color: #0f0f0f; text-align: center; margin: 0 0 5mm; border-bottom: 2.5pt solid #1a1a1a; padding-bottom: 5mm; break-after: avoid; }
    .sub { text-align: center; font-variant: small-caps; letter-spacing: 0.16em; font-size: 14pt; margin: 0 0 0; break-after: avoid; }
    h2 { font-size: 14pt; letter-spacing: 0.03em; text-transform: uppercase; color: #0f0f0f; margin: 0 0 3mm; break-after: avoid; orphans: 3; widows: 3; }
    p { margin: 0 0 4mm; text-align: justify; orphans: 3; widows: 3; }
    .sp { height: 3mm; }
    .sig { margin: 12mm 0 0; text-align: center; }
    p.char { margin: 0 0 2mm; text-align: left; }
  `;
  const header = `<div class="header"><img src="${LOGO_DATA_URI}" alt="logo"><hr></div>`;
  const footerLeft = `<div class="footer-left">info@mylconsultoríasyperitajes.com</div>`;
  const footerRight = `<div class="footer-right">8998-4852 / 8408-5447</div>`;
  const footerCenter = `<div class="footer-center">Página <span class="page"></span> de <span class="pages"></span></div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe Pericial ${esc(v.plate)}</title><style>${css}</style></head><body>${header}${footerLeft}${footerRight}${footerCenter}${parts.join("\n")}</body></html>`;
}

export async function buildReportDocx(v: RnpVehicleData, fill: ReportFill) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, PageNumber, AlignmentType, BorderStyle, Header, Footer } = await import("docx");
  const lines = buildReportLines(v, fill);
  const children: import("docx").FileChild[] = [];
  for (const l of lines) {
    if (l.kind === "h1") {
      children.push(new Paragraph({ children: [new TextRun({ text: l.text || "", bold: true, size: 52, font: "Arial", color: "111111" })], alignment: "center", spacing: { after: 360 }, keepNext: true }));
    } else if (l.kind === "sub") {
      children.push(new Paragraph({ children: [new TextRun({ text: l.text || "", size: 28, font: "Arial", color: "333333", smallCaps: true })], alignment: "center", spacing: { after: 0 }, keepNext: true }));
    } else if (l.kind === "h2") {
      children.push(new Paragraph({ children: [new TextRun({ text: l.text || "", bold: true, size: 28, font: "Arial", color: "111111" })], spacing: { before: 0, after: 0 }, keepNext: true }));
    } else if (l.kind === "p") {
      children.push(new Paragraph({ children: [new TextRun({ text: l.text || "", size: 24, font: "Arial", color: "1a1a1a" })], alignment: "both", spacing: { after: 160 }, keepNext: true }));
    } else if (l.kind === "blank") {
      children.push(new Paragraph({ spacing: { after: 120 } }));
    } else if (l.kind === "sig") {
      children.push(new Paragraph({ children: [new TextRun({ text: l.text || "", size: 24, font: "Arial", color: "1a1a1a" })], alignment: "center", spacing: { after: 160 } }));
    } else if (l.kind === "table" && l.rows) {
      // Render the characteristics fields as plain lines separated by break
      // lines (no table, no bullets, no numbering).
      for (const [k, val] of l.rows) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${k}: `, bold: true, size: 24, font: "Arial", color: "111111" }),
            new TextRun({ text: val, size: 24, font: "Arial", color: "1a1a1a" }),
          ],
          spacing: { after: 80 },
          keepNext: true,
        }));
      }
      children.push(new Paragraph({ spacing: { after: 160 } }));
    }
  }

  const header = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new ImageRun({
        data: Buffer.from(LOGO_DATA_URI.split(",")[1], "base64"),
        transformation: { width: 90, height: 90 },
        type: "jpg",
      }),
    ],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: "1a1a1a", space: 4 },
    },
    spacing: { after: 120 },
  });

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [3247, 3346, 3247],
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "info@mylconsultoríasyperitajes.com", size: 18, font: "Arial", color: "333333" })] })],
          }),
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Página ", size: 18, font: "Arial", color: "333333" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial", color: "333333" }),
                new TextRun({ text: " de ", size: 18, font: "Arial", color: "333333" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: "Arial", color: "333333" }),
              ],
            })],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "8998-4852 / 8408-5447", size: 18, font: "Arial", color: "333333" })],
            })],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1400, bottom: 1200, left: 1200, right: 1200 },
          },
        },
        headers: {
          default: new Header({ children: [header] }),
        },
        footers: {
          default: new Footer({ children: [footerTable] }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
