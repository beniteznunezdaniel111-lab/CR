import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createJob, selectOption, signUpAdminWithOrg } from "./helpers";

const CVS = join(import.meta.dirname, "..", "fixtures", "cvs");
const ANA_PDF = join(CVS, "cv-ana-martin.pdf");
const LUIS_DOCX = join(CVS, "cv-luis-perez.docx");
const SCANNED_PDF = join(CVS, "cv-escaneado.pdf");

test.describe("filtrado de CVs con revisión humana", () => {
  test.setTimeout(120_000);

  test("RRHH sube CVs, revisa el encaje con evidencias, decide y borra a petición", async ({
    page,
  }) => {
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Carla Selección",
      orgName: `Empresa CVs ${Date.now()}`,
    });
    const title = `Coordinador/a de almacén ${Date.now()}`;
    const jobUrl = await createJob(page, orgUrl, {
      title,
      requirements: [
        { text: "Experiencia en gestión de almacén" },
        { text: "Carné de carretillero" },
        { text: "Inglés B2", kind: "Deseable" },
      ],
    });

    // 1. Desde la ficha del puesto a sus candidaturas.
    await page.getByRole("link", { name: /Ver candidaturas/ }).click();
    await expect(page.getByRole("heading", { name: `Candidaturas · ${title}` })).toBeVisible();
    await expect(
      page.getByRole("note", { name: "Sugerencia de IA – requiere revisión humana" }),
    ).toBeVisible();
    const candidatesUrl = new URL(page.url()).pathname;
    expect(candidatesUrl).toBe(`${jobUrl}/candidates`);

    // 2. Subida de tres CVs: PDF, DOCX y un PDF escaneado (sin texto).
    await page.getByLabel("Ficheros de CV").setInputFiles([ANA_PDF, LUIS_DOCX, SCANNED_PDF]);
    const progress = page.getByRole("list", { name: "Progreso de la subida" });
    await expect(progress.getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Subir y analizar" }).click();

    const step = (name: string) => progress.getByRole("listitem").filter({ hasText: name });
    await expect(step("cv-ana-martin.pdf")).toContainText("Analizado", { timeout: 60_000 });
    await expect(step("cv-luis-perez.docx")).toContainText("Analizado", { timeout: 60_000 });
    await expect(step("cv-escaneado.pdf")).toContainText("no tiene texto", { timeout: 60_000 });

    // 3. Tabla: recuento determinista (cumple con cita comprobada), no una puntuación.
    const anaRow = page.getByRole("row").filter({ hasText: "Ana Martín Ruiz" });
    await expect(anaRow).toContainText("1 de 2");
    await expect(anaRow).toContainText("1 de 1");
    await expect(anaRow).toContainText("Pendiente de revisar");
    await expect(page.getByRole("row").filter({ hasText: "Luis Pérez Gómez" })).toContainText(
      "0 de 2",
    );
    const scannedRow = page.getByRole("row").filter({ hasText: "cv-escaneado.pdf" });
    await expect(scannedRow).toContainText("Error");
    await expect(scannedRow.getByRole("button", { name: "Reintentar" })).toBeVisible();

    // Filtro: solo las candidaturas con errores.
    await page.getByLabel("Con errores de análisis").check();
    await expect(anaRow).toHaveCount(0);
    await expect(scannedRow).toBeVisible();
    await page.getByLabel("Con errores de análisis").uncheck();

    // 4. Ficha: encaje requisito por requisito con la cita del CV.
    await anaRow.getByRole("link", { name: "Ana Martín Ruiz" }).click();
    await expect(page.getByRole("heading", { name: "Ana Martín Ruiz" })).toBeVisible();
    await expect(
      page.getByRole("note", { name: "Sugerencia de IA – requiere revisión humana" }),
    ).toBeVisible();
    const match = (text: string) => page.getByTestId("requirement-match").filter({ hasText: text });
    await expect(match("Experiencia en gestión de almacén")).toContainText("Cumple");
    await expect(match("Experiencia en gestión de almacén")).toContainText(
      "Cita comprobada en el CV",
    );
    await expect(match("Carné de carretillero")).toContainText("No consta");
    await expect(page.getByText(/«Carné de carretillero»\?/)).toBeVisible();
    await expect(page.getByText("ana.martin@example.com")).toBeVisible();

    // El texto que analizó la IA no lleva datos identificativos.
    await page.getByText("Ver el texto").click();
    const redacted = page.locator("pre");
    await expect(redacted).toContainText("[dato personal omitido]");
    await expect(redacted).not.toContainText("example.com");
    await expect(redacted).not.toContainText("1990");

    // 5. Decisión humana con comentario: queda en el historial.
    await selectOption(page, "Nuevo estado", "Avanza");
    await page.getByLabel("Comentario (opcional)").fill("Experiencia sólida en almacén.");
    await page.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByText("Decisión guardada.")).toBeVisible();
    const history = page.getByRole("list", { name: "Historial" });
    await expect(history).toContainText("Pendiente de revisar → Avanza");
    await expect(history).toContainText("Experiencia sólida en almacén.");

    // 6. Filtro por estado en la tabla.
    await page.goto(candidatesUrl);
    await selectOption(page, "Filtrar por estado", "Avanza");
    await expect(page.getByRole("row").filter({ hasText: "Ana Martín Ruiz" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Luis Pérez Gómez" })).toHaveCount(0);

    // 7. Borrado a petición de la persona candidata.
    await page.goto(candidatesUrl);
    await page.getByRole("link", { name: "Candidatura n.º 3" }).click();
    await expect(page.getByText(/no tiene texto/)).toBeVisible();
    await page.getByRole("button", { name: "Eliminar candidatura" }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${candidatesUrl}$`));
    await expect(page.getByRole("row").filter({ hasText: "cv-escaneado.pdf" })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "Ana Martín Ruiz" })).toBeVisible();
  });

  test("en modo anónimo la identidad solo se ve tras revelarla con un motivo", async ({ page }) => {
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Dani Anónimo",
      orgName: `Empresa Anónima ${Date.now()}`,
    });
    const jobUrl = await createJob(page, orgUrl, {
      title: `Responsable de turno ${Date.now()}`,
      requirements: [{ text: "Gestión de inventarios" }],
    });

    await page.goto(`${jobUrl}/candidates`);
    await page.getByRole("button", { name: "Activar revisión anónima" }).click();
    await expect(page.getByText("Revisión anónima activada.")).toBeVisible();

    await page.getByLabel("Ficheros de CV").setInputFiles([LUIS_DOCX]);
    await page.getByRole("button", { name: "Subir y analizar" }).click();
    await expect(
      page.getByRole("list", { name: "Progreso de la subida" }).getByRole("listitem"),
    ).toContainText("Analizado", { timeout: 60_000 });

    // Ni el nombre ni el fichero aparecen; el modo ya no se puede desactivar.
    const table = page.getByRole("table");
    await expect(table).toContainText("Candidatura n.º 1");
    await expect(table).toContainText("1 de 1");
    await expect(table).not.toContainText("Luis");
    await expect(
      page.getByText("No se puede desactivar mientras el puesto tenga candidaturas."),
    ).toBeVisible();

    await page.getByRole("link", { name: "Candidatura n.º 1" }).click();
    await expect(page.getByRole("heading", { name: "Candidatura n.º 1" })).toBeVisible();
    await expect(page.getByText(/el CV original están ocultos/)).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("Luis");

    // Revelar exige un motivo de al menos 10 caracteres.
    await page.getByRole("button", { name: "Revelar identidad" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo").fill("corto");
    await dialog.getByRole("button", { name: "Revelar", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("entre 10 y 500 caracteres");
    await dialog.getByLabel("Motivo").fill("Concertar la entrevista final");
    await dialog.getByRole("button", { name: "Revelar", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Luis Pérez Gómez" })).toBeVisible();
    await expect(page.getByText("luis.perez@example.com")).toBeVisible();
    const history = page.getByRole("list", { name: "Historial" });
    await expect(history).toContainText("Identidad revelada");
    await expect(history).toContainText("Concertar la entrevista final");
  });
});
