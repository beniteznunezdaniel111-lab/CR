/**
 * Genera los documentos ficticios de la FAQ que usan los tests (unitarios y E2E):
 *   tests/fixtures/faq/politica-vacaciones.pdf   PDF de 2 páginas con texto
 *   tests/fixtures/faq/manual-bienvenida.docx    DOCX
 *
 *   pnpm exec tsx scripts/make-faq-fixtures.ts
 *
 * Contenido inventado. Sin dependencias: PDF y ZIP (DOCX) escritos a mano.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";

const OUT = join(import.meta.dirname, "..", "tests", "fixtures", "faq");

export const POLICY_PAGES = [
  [
    "POLÍTICA DE VACACIONES Y PERMISOS",
    "Empresa Demo - Versión 2026 (documento ficticio)",
    "",
    "1. Vacaciones",
    "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
    "Las vacaciones se solicitan en el portal con quince días de antelación.",
    "Los días no disfrutados pueden usarse hasta el 31 de marzo del año siguiente.",
  ],
  [
    "2. Teletrabajo",
    "Se puede teletrabajar dos días por semana con acuerdo del responsable directo.",
    "",
    "3. Permisos retribuidos",
    "Por matrimonio o registro de pareja de hecho corresponden 15 días naturales.",
    "Por mudanza del domicilio habitual corresponde un día.",
  ],
];

export const HANDBOOK_PARAGRAPHS = [
  "MANUAL DE BIENVENIDA",
  "Horario",
  "La jornada general es de 9:00 a 17:00 con una hora para comer.",
  "Material",
  "El primer día recibirás un portátil y una tarjeta de acceso.",
];

// ---------------------------------------------------------------------------
// PDF mínimo de varias páginas (Helvetica, WinAnsiEncoding: tildes y eñes).
// ---------------------------------------------------------------------------
function pdfString(text: string): string {
  const bytes = Buffer.from(text, "latin1");
  let out = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += char;
  }
  return `(${out})`;
}

function textPdf(pages: string[][]): Buffer {
  const pageCount = pages.length;
  // 1 catálogo, 2 páginas, 3 fuente, después (página, contenido) por cada página.
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  for (const [index, lines] of pages.entries()) {
    const body = lines.map((line) => `${pdfString(line)} Tj T*`).join("\n");
    const content = `BT\n/F1 11 Tf\n14 TL\n50 790 Td\n${body}\nET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ---------------------------------------------------------------------------
// DOCX mínimo: ZIP sin compresión con el XML de Word.
// ---------------------------------------------------------------------------
function zip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(0, 10);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function docx(paragraphs: string[]): Buffer {
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`)
    .join("");
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "politica-vacaciones.pdf"), textPdf(POLICY_PAGES));
writeFileSync(join(OUT, "manual-bienvenida.docx"), docx(HANDBOOK_PARAGRAPHS));
console.log(`✓ Documentos de prueba de la FAQ en ${OUT}`);
