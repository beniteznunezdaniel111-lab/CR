import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createJob, signUpAdminWithOrg } from "./helpers";

const ANA_PDF = join(import.meta.dirname, "..", "fixtures", "cvs", "cv-ana-martin.pdf");

test.describe("guías de entrevista y onboarding", () => {
  test.setTimeout(120_000);

  test("guía de entrevista para el puesto y adaptada a una candidatura, con vista de impresión", async ({
    page,
  }) => {
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Elena Entrevistas",
      orgName: `Empresa Entrevistas ${Date.now()}`,
    });
    const title = `Responsable de almacén ${Date.now()}`;
    const jobUrl = await createJob(page, orgUrl, {
      title,
      requirements: [
        { text: "Experiencia en gestión de almacén" },
        { text: "Carné de carretillero" },
      ],
    });

    // 1. Guía para el puesto.
    await page.getByRole("link", { name: /Preparar guía/ }).click();
    await expect(
      page.getByRole("heading", { name: `Guía de entrevista · ${title}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Aún no hay guías para este puesto" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Generar guía" }).click();
    await expect(page.getByText("Guía generada.")).toBeVisible();
    for (const section of [
      "Competencias",
      "Preguntas técnicas",
      "Preguntas de comportamiento (método STAR)",
      "Rúbrica de evaluación",
    ]) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    await expect(
      page.getByTestId("guide-question").filter({ hasText: "«Experiencia en gestión de almacén»" }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Nivel 5" })).toBeVisible();

    // 2. Una candidatura analizada → guía adaptada desde su ficha.
    await page.goto(`${jobUrl}/candidates`);
    await page.getByLabel("Ficheros de CV").setInputFiles([ANA_PDF]);
    await page.getByRole("button", { name: "Subir y analizar" }).click();
    await expect(
      page.getByRole("list", { name: "Progreso de la subida" }).getByRole("listitem"),
    ).toContainText("Analizado", { timeout: 60_000 });
    await page.getByRole("link", { name: "Ana Martín Ruiz" }).click();
    await page.getByRole("link", { name: "Preparar guía de entrevista" }).click();
    await expect(page.getByRole("radio", { name: "Adaptada a una candidatura" })).toBeChecked();
    await page.getByRole("button", { name: "Generar guía" }).click();
    await expect(page.getByText("Adaptada a: Ana Martín Ruiz")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Para aclarar con esta candidatura" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("guide-question").filter({ hasText: "«Carné de carretillero»" }).first(),
    ).toBeVisible();

    // El historial conserva la guía anterior.
    await page.getByRole("combobox", { name: "Guía", exact: true }).click();
    await expect(page.getByRole("option")).toHaveCount(2);
    await page.keyboard.press("Escape");

    // 3. Vista de impresión con espacio para notas.
    const printHref = await page.getByRole("link", { name: "Imprimir o PDF" }).getAttribute("href");
    await page.goto(printHref!);
    await expect(page.getByRole("button", { name: "Imprimir o guardar como PDF" })).toBeVisible();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByText("Notas").first()).toBeVisible();
  });

  test("plan de onboarding 30/60/90: generar, editar, asignar y completar tareas", async ({
    page,
  }) => {
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Olga Onboarding",
      orgName: `Empresa Onboarding ${Date.now()}`,
    });
    const title = `Técnico/a de almacén ${Date.now()}`;
    await createJob(page, orgUrl, {
      title,
      requirements: [{ text: "Experiencia en almacén" }],
    });

    // 1. Desde la ficha del puesto: generar el plan con IA.
    await page.getByRole("link", { name: /Crear plan/ }).click();
    await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
    await page.getByRole("button", { name: "Generar plan con IA" }).click();
    await expect(
      page.getByRole("heading", { name: `Plan de incorporación · ${title}` }),
    ).toBeVisible();
    await expect(page.getByText(/Plan generado con IA/)).toBeVisible();

    // 2. Editar una tarea y guardar.
    const firstTask = page.getByRole("group", { name: "Tarea 1", exact: true });
    await firstTask.getByLabel("Título").fill("Bienvenida al equipo de almacén");
    await page.getByRole("button", { name: "Guardar plan" }).click();
    await expect(page.getByText("Plan guardado.")).toBeVisible();

    // 3. Asignarlo a una persona que aún no tiene cuenta.
    await page.getByRole("button", { name: "Asignar a una persona" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre de la persona").fill("Marta Nueva");
    await dialog.getByRole("button", { name: "Asignar" }).click();
    await expect(page.getByRole("heading", { name: "Incorporación de Marta Nueva" })).toBeVisible();
    await expect(page.getByText("Sin cuenta en la plataforma")).toBeVisible();
    await expect(page.getByText(/^0 de \d+ tareas completadas$/)).toBeVisible();

    // 4. Marcar una tarea como hecha: queda quién y cuándo.
    await page.getByLabel("Marcar «Bienvenida al equipo de almacén» como hecha").check();
    await expect(page.getByText(/^1 de \d+ tareas completadas$/)).toBeVisible();
    await expect(page.getByText(/Hecha por Olga Onboarding/)).toBeVisible();

    // 5. Resumen de incorporaciones.
    await page.goto(`${orgUrl}/onboarding`);
    const row = page.getByRole("row").filter({ hasText: "Marta Nueva" });
    await expect(row).toContainText(/1\/\d+/);
    // El plan aparece en la tabla de planes (en la de incorporaciones es solo texto).
    await expect(
      page.getByRole("link", { name: `Plan de incorporación · ${title}` }),
    ).toBeVisible();
  });
});
