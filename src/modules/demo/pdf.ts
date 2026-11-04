/**
 * PDF mínimo de texto (Helvetica, WinAnsiEncoding: tildes y eñes) para los
 * documentos ficticios de la empresa demo. Sin dependencias.
 */
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

/** Un PDF con una página por cada lista de líneas. */
export function textPdf(pages: readonly (readonly string[])[]): Uint8Array {
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((lines, index) => {
    const body = lines.map((line) => `${pdfString(line)} Tj T*`).join("\n");
    const content = `BT\n/F1 11 Tf\n14 TL\n50 790 Td\n${body}\nET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
  });
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
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
