import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCX_MIME,
  PDF_MIME,
  extractDocumentText,
  mimeFromFilename,
  normalizeExtractedText,
} from "@/lib/extraction";
import {
  findProtectedMentions,
  removeProtectedSentences,
} from "@/lib/inclusive/protected-mentions";
import {
  EMPTY_IDENTITY,
  REDACTION_MARK,
  detectContacts,
  redactCvText,
  redactIdentity,
} from "@/lib/privacy/redaction";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures", "cvs");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

describe("extracción de texto", () => {
  it("lee un PDF con texto, con tildes y eñes", async () => {
    const { text } = await extractDocumentText(fixture("cv-ana-martin.pdf"), PDF_MIME);
    expect(text).toContain("Ana Martín Ruiz");
    expect(text).toContain("Experiencia en gestión de almacén");
    expect(text).toContain("FORMACIÓN");
  });

  it("lee un DOCX", async () => {
    const { text } = await extractDocumentText(fixture("cv-luis-perez.docx"), DOCX_MIME);
    expect(text).toContain("Luis Pérez Gómez");
    expect(text).toContain("Gestión de inventarios");
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("rechaza un PDF escaneado (sin texto): no hay OCR", async () => {
    await expect(extractDocumentText(fixture("cv-escaneado.pdf"), PDF_MIME)).rejects.toMatchObject({
      code: "no_text",
    });
  });

  it("rechaza tipos no admitidos y ficheros dañados", async () => {
    await expect(
      extractDocumentText(fixture("cv-ana-martin.pdf"), "image/png"),
    ).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(
      extractDocumentText(new TextEncoder().encode("no es un pdf"), PDF_MIME),
    ).rejects.toMatchObject({ code: "unreadable" });
  });

  it("deduce el tipo por la extensión y normaliza el texto", () => {
    expect(mimeFromFilename("CV Ana.PDF")).toBe(PDF_MIME);
    expect(mimeFromFilename("cv.docx")).toBe(DOCX_MIME);
    expect(mimeFromFilename("cv.doc")).toBeNull();
    expect(normalizeExtractedText("a\r\n\r\n\r\n\r\nb\u0000\t c  ")).toBe("a\n\nb c");
  });
});

describe("anonimización del CV", () => {
  const ana = [
    "Ana Martín Ruiz",
    "Técnica de logística",
    "ana.martin@example.com · +34 612 345 678 · linkedin.com/in/ana-martin-ruiz",
    "Calle Mayor 12, 28013 Madrid",
    "Fecha de nacimiento: 14/03/1990",
    "Nacionalidad: española",
    "Estado civil: casada (34 años)",
    "EXPERIENCIA",
    "2015-2019 · Técnica de logística en Logística Ruiz",
    "- Presupuesto anual de 12.000.000 € y equipo de 25 personas",
    "Referencias: Ana Martín, ex-compañera. ANA MARTÍN RUIZ",
  ].join("\n");

  it("quita contacto, dirección, nacimiento, nacionalidad, estado civil y el nombre", () => {
    const { text, counts } = redactCvText(ana, {
      fullName: "Ana Martín Ruiz",
      email: "ana.martin@example.com",
      phone: "+34 612 345 678",
      location: null,
      links: [],
    });
    for (const secret of [
      "Ana",
      "Martín",
      "ANA",
      "example.com",
      "612",
      "linkedin",
      "Calle Mayor",
      "1990",
      "española",
      "casada",
      "34 años",
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).toContain(REDACTION_MARK);
    expect(counts.emails + counts.phones + counts.links + counts.names).toBeGreaterThan(3);
  });

  it("conserva la información profesional: fechas, cifras y cargos", () => {
    const { text } = redactCvText(ana, EMPTY_IDENTITY);
    expect(text).toContain("Técnica de logística");
    expect(text).toContain("2015-2019");
    expect(text).toContain("12.000.000 €");
    expect(text).toContain("25 personas");
  });

  it("sin datos de la IA, oculta igualmente la primera línea con forma de nombre", () => {
    const { text } = redactCvText(ana, EMPTY_IDENTITY);
    expect(text.startsWith(REDACTION_MARK)).toBe(true);
    expect(text).not.toContain("ana.martin@example.com");
  });

  it("reconoce teléfonos de España y Costa Rica pero no rangos de años", () => {
    const text = "Móvil 612345678. Fijo 2222-2222. (506) 8888 1234. Años 2015-2019. Cód. 28013.";
    const redacted = redactIdentity(text, EMPTY_IDENTITY);
    expect(redacted).not.toMatch(/612345678|2222-2222|8888 1234/);
    expect(redacted).toContain("2015-2019");
    expect(redacted).toContain("28013");
  });

  it("solo oculta partes del nombre escritas como nombre propio", () => {
    const identity = { ...EMPTY_IDENTITY, fullName: "Rosa del Mar" };
    const redacted = redactIdentity("Rosa diseñó la sala rosa junto al mar.", identity);
    expect(redacted).toBe(`${REDACTION_MARK} diseñó la sala rosa junto al mar.`);
  });

  it("detecta datos de contacto sin IA (respaldo y modo simulado)", () => {
    expect(detectContacts(ana)).toMatchObject({
      fullName: "Ana Martín Ruiz",
      email: "ana.martin@example.com",
      phone: "+34 612 345 678",
      links: ["linkedin.com/in/ana-martin-ruiz"],
    });
    expect(detectContacts("experiencia en almacén").fullName).toBeNull();
  });
});

describe("menciones a atributos protegidos en textos de la IA", () => {
  it.each([
    ["La persona candidata es joven y dinámica.", "age"],
    ["Es una mujer con experiencia.", "gender"],
    ["Está casada y tiene dos hijos.", "family_marital"],
    ["Su nacionalidad facilita el trámite.", "origin_nationality"],
    ["Tiene buena presencia.", "appearance"],
    ["Menciona una discapacidad.", "health_disability"],
    ["Pertenece a un sindicato.", "religion_beliefs"],
    ["¿Cuál es tu salario actual?", "salary_history"],
  ])("detecta «%s» (%s)", (text, category) => {
    expect(findProtectedMentions(text, "ES").map((mention) => mention.category)).toContain(
      category,
    );
  });

  it.each([
    "Ha trabajado en centros de salud y en el sector sanitario.",
    "Aporta mayor experiencia en logística que la requerida.",
    "Inglés nativo y francés B2.",
    "Gestión de un equipo de 25 personas.",
    "Coordinó el origen y destino de los envíos.",
  ])("no señala «%s»", (text) => {
    expect(findProtectedMentions(text, "ES")).toEqual([]);
  });

  it("el historial salarial solo se vigila en España", () => {
    expect(findProtectedMentions("¿Cuál es su salario actual?", "CR")).toEqual([]);
  });

  it("retira solo las frases afectadas", () => {
    const result = removeProtectedSentences(
      "Tiene experiencia en almacén. Es joven. Domina SAP.",
      "ES",
    );
    expect(result).toEqual({
      text: "Tiene experiencia en almacén. Domina SAP.",
      categories: ["age"],
    });
  });
});
