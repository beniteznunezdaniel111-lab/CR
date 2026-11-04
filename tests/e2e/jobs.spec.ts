import { expect, test } from "@playwright/test";
import { selectOption, sidebar, signUpAdminWithOrg } from "./helpers";

test.describe("puestos y ofertas", () => {
  test("RRHH crea un puesto, genera las ofertas, revisa el lenguaje, versiona y exporta", async ({
    page,
  }) => {
    const title = `Técnico/a de logística E2E ${Date.now()}`;
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Rita RRHH",
      orgName: `Empresa Puestos ${Date.now()}`,
    });

    // 1. Lista vacía → nuevo puesto.
    await sidebar(page)
      .getByRole("link", { name: /Puestos y ofertas/ })
      .click();
    await expect(page.getByRole("heading", { name: "Aún no hay puestos" })).toBeVisible();
    await page.getByRole("link", { name: "Nuevo puesto" }).first().click();

    // 2. Formulario, con un requisito discriminatorio para ver el aviso en vivo.
    await page.getByLabel("Título del puesto").fill(title);
    await selectOption(page, "Nivel", "Intermedio");
    await selectOption(page, "Modalidad", "Híbrido");
    await page.getByLabel("Responsabilidades clave").fill("Coordinar envíos\nGestionar el almacén");
    await page.getByLabel("Requisito 1").fill("Experiencia en gestión de almacén");
    await page.getByRole("button", { name: "Añadir requisito" }).click();
    await page.getByLabel("Requisito 2").fill("Buena presencia");
    await expect(page.getByRole("status", { name: /podrían ser discriminatorios/ })).toContainText(
      "Buena presencia",
    );
    await page.getByRole("button", { name: "Crear puesto" }).click();

    // 3. Ficha del puesto sin contenido → generar con IA (proveedor mock en CI).
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const jobUrl = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Generar con IA" }).click();
    const internal = page.getByRole("textbox", { name: "Descripción interna" });
    await expect(internal).toContainText("Experiencia en gestión de almacén");
    await expect(
      page.getByText(/^Versión 1 de 1 · Generada con IA · job\.generate@1/),
    ).toBeVisible();
    for (const tab of ["LinkedIn", "Portal de empleo", "Web propia"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }

    // 4. Revisión inclusiva: la apariencia se señala y falta la banda salarial (España).
    await expect(page.getByText("Revisado con las reglas automáticas y con IA.")).toBeVisible();
    await expect(
      page.getByTestId("inclusive-finding").filter({ hasText: "Apariencia física" }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Directiva \(UE\) 2023\/970/).first()).toBeVisible();

    // 5. Edición manual → versión 2.
    await internal.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Texto añadido en la prueba.");
    await expect(page.getByText("Hay cambios sin guardar.")).toBeVisible();
    await page.getByRole("button", { name: "Guardar como nueva versión" }).click();
    await expect(page.getByText(/^Versión 2 de 2 · Editada a mano/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Descripción interna" })).toContainText(
      "Texto añadido en la prueba.",
    );

    // 6. Ver la versión 1 (solo lectura) y restaurarla → versión 3.
    await page.getByRole("combobox").filter({ hasText: /^v2/ }).click();
    await page.getByRole("option", { name: /^v1 · / }).click();
    await expect(page.getByText(/Estás viendo la versión 1/)).toBeVisible();
    await page.getByRole("button", { name: "Restaurar esta versión" }).click();
    await expect(page.getByText(/^Versión 3 de 3 · Restaurada de la versión 1/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Descripción interna" })).not.toContainText(
      "Texto añadido en la prueba.",
    );

    // 7. Exportar Markdown.
    await page.getByRole("button", { name: "Exportar" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Descargar este texto (.md)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/descripcion-interna-v3\.md$/);

    // 8. Vista de impresión (PDF) con los cuatro textos.
    await page.goto(`/print${jobUrl.replace(/^\/app/, "")}?v=3&doc=all`);
    await expect(page.getByRole("button", { name: "Imprimir o guardar como PDF" })).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(4);

    // 9. Cambiar el estado y verlo en la lista.
    await page.goto(jobUrl);
    await page.getByRole("combobox").filter({ hasText: "Borrador" }).click();
    await page.getByRole("option", { name: "Abierto" }).click();
    await expect(page.getByText("Estado actualizado.")).toBeVisible();
    await page.goto(`${orgUrl}/jobs`);
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toContainText("Abierto");
    await expect(row).toContainText("Versión 3");

    // 10. Eliminar el puesto.
    await page.goto(jobUrl);
    await page.getByRole("button", { name: "Eliminar puesto" }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aún no hay puestos" })).toBeVisible();
  });
});
