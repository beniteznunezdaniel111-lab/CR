/**
 * Genera los CVs ficticios que usan los tests (unitarios y E2E):
 *   tests/fixtures/cvs/cv-ana-martin.pdf    PDF con texto
 *   tests/fixtures/cvs/cv-luis-perez.docx   DOCX
 *   tests/fixtures/cvs/cv-escaneado.pdf     PDF sin texto (como un escaneo sin OCR)
 *
 *   pnpm exec tsx scripts/make-cv-fixtures.ts
 *
 * Datos inventados. Sin dependencias: PDF y ZIP (DOCX) escritos a mano.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";

const OUT = join(import.meta.dirname, "..", "tests", "fixtures", "cvs");

export const ANA_LINES = [
  "Ana Martín Ruiz",
  "Técnica de logística",
  "ana.martin@example.com · +34 612 345 678 · linkedin.com/in/ana-martin-ruiz",
  "Calle Mayor 12, 28013 Madrid",
  "Fecha de nacimiento: 14/03/1990",
  "Nacionalidad: española",
  "Estado civil: casada",
  "",
  "EXPERIENCIA",
  "2019 - actualidad · Coordinadora de almacén · Logística Norte S.L.",
  "- Experiencia en gestión de almacén con tres turnos y 25 personas",
  "- Implantación de un sistema de gestión de almacén (SGA)",
  "2015 - 2019 · Técnica de logística · Distribuciones Sur S.A.",
  "- Coordinación de envíos nacionales e internacionales",
  "",
  "FORMACIÓN",
  "2014 · Grado en Administración y Dirección de Empresas · Universidad de Sevilla",
  "",
  "IDIOMAS",
  "Inglés B2 · Francés A2",
  "",
  "HABILIDADES",
  "SAP, Excel avanzado, planificación de rutas, carné de conducir B",
];

export const LUIS_PARAGRAPHS = [
  "Luis Pérez Gómez",
  "Responsable de operaciones",
  "Email: luis.perez@example.com",
  "Teléfono: 8888 1234",
  "San José, Costa Rica",
  "Experiencia",
  "2018 - 2024 · Jefe de turno · Bodegas del Valle",
  "Gestión de inventarios y coordinación de un equipo de 12 personas.",
  "Formación",
  "Técnico en logística · Instituto Nacional de Aprendizaje",
  "Idiomas",
  "Español nativo, inglés B1",
];

// ---------------------------------------------------------------------------
// PDF mínimo (Helvetica, WinAnsiEncoding: admite tildes y eñes).
// ---------------------------------------------------------------------------
function pdfString(text: string): string {
  const bytes = Buffer.from(text.replaceAll("·", "-"), "latin1");
  let out = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += char;
  }
  return `(${out})`;
}

function buildPdf(content: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
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

function textPdf(lines: string[]): Buffer {
  const body = lines.map((line) => `${pdfString(line)} Tj T*`).join("\n");
  return buildPdf(`BT\n/F1 11 Tf\n14 TL\n50 790 Td\n${body}\nET`);
}

// Un "escaneo": solo un rectángulo gris, sin texto.
function scannedPdf(): Buffer {
  return buildPdf("0.8 g\n50 400 495 380 re f");
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
    header.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    header.writeUInt16LE(0, 8); // sin compresión
    header.writeUInt32LE(0, 10); // fecha/hora
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
writeFileSync(join(OUT, "cv-ana-martin.pdf"), textPdf(ANA_LINES));
writeFileSync(join(OUT, "cv-luis-perez.docx"), docx(LUIS_PARAGRAPHS));
writeFileSync(join(OUT, "cv-escaneado.pdf"), scannedPdf());
console.log(`✓ CVs de prueba en ${OUT}`);
