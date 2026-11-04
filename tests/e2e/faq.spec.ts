import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signUpAdminWithOrg } from "./helpers";

const POLICY_PDF = join(import.meta.dirname, "..", "fixtures", "faq", "politica-vacaciones.pdf");

test.describe("FAQ interna", () => {
  test.setTimeout(120_000);

  test("documento → respuesta citada → «no lo sé» → consulta a RRHH respondida con aviso", async ({
    page,
  }) => {
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Fátima FAQ",
      orgName: `Empresa FAQ ${Date.now()}`,
    });

    // 0. Sin documentos: estado vacío con acceso a la subida.
    await page.goto(`${orgUrl}/faq`);
    await expect(page.getByRole("heading", { name: "Todavía no hay documentos" })).toBeVisible();
    await page.getByRole("link", { name: "Subir documentos" }).click();

    // 1. Subir y procesar la política (2 páginas → 4 fragmentos por secciones).
    await expect(page.getByRole("heading", { name: "Documentos de la FAQ" })).toBeVisible();
    await page.getByLabel("Fichero").setInputFiles(POLICY_PDF);
    await page.getByLabel("Título", { exact: true }).fill("Política de vacaciones y permisos");
    await page.getByRole("button", { name: "Subir y procesar" }).click();
    await expect(page.getByText("Documento listo: 4 fragmentos.").first()).toBeVisible({
      timeout: 60_000,
    });
    const row = page
      .getByTestId("kb-document")
      .filter({ hasText: "Política de vacaciones y permisos" });
    await expect(row).toContainText("Listo");
    await expect(row).toContainText("2 páginas");

    // 2. Pregunta con respuesta citada: documento, página y fragmento.
    await page.getByRole("link", { name: "Volver a la FAQ" }).click();
    await page.getByLabel("Tu pregunta").fill("¿Cuántos días de vacaciones tengo al año?");
    await page.getByRole("button", { name: "Preguntar", exact: true }).click();
    const source = page.getByTestId("faq-source").first();
    await expect(source).toContainText("Política de vacaciones y permisos");
    await expect(source).toContainText("pág. 1");
    await expect(source).toContainText("23 días laborables de vacaciones al año");
    await expect(page.getByRole("link", { name: "Fuente 1" })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Tus conversaciones" })
        .getByRole("link", { name: /Cuántos días de vacaciones/ }),
    ).toBeVisible();

    // 3. Sin respuesta en la documentación: no se inventa y se ofrece preguntar a RRHH.
    await page.getByLabel("Tu pregunta").fill("¿Cuál es el horario del comedor?");
    await page.getByRole("button", { name: "Preguntar", exact: true }).click();
    await expect(page.getByText(/No encuentro esto en la documentación/)).toBeVisible();
    await page.getByRole("button", { name: "Preguntar a RRHH" }).last().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Tu consulta")).toHaveValue("¿Cuál es el horario del comedor?");
    await dialog.getByRole("button", { name: "Enviar a RRHH" }).click();
    await expect(page.getByText(/Consulta enviada/).first()).toBeVisible();

    // 4. RRHH responde desde su bandeja; las preguntas del chat aparecen anónimas.
    await page.goto(`${orgUrl}/hr-queries`);
    const query = page
      .getByTestId("hr-query")
      .filter({ hasText: "¿Cuál es el horario del comedor?" });
    await expect(query).toContainText("De Fátima FAQ");
    await query.getByLabel("Respuesta").fill("El comedor abre de 13:00 a 15:30.");
    await query.getByRole("button", { name: "Responder" }).click();
    await expect(query).toContainText("Respondida por Fátima FAQ");

    await page.getByRole("tab", { name: "Preguntas frecuentes" }).click();
    await expect(
      page
        .getByTestId("faq-cluster")
        .filter({ hasText: "¿Cuántos días de vacaciones tengo al año?" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Sin respuesta" }).click();
    await expect(
      page.getByTestId("faq-cluster").filter({ hasText: "¿Cuál es el horario del comedor?" }),
    ).toBeVisible();

    // 5. Quien preguntó recibe un aviso dentro de la app y ve la respuesta.
    await page.getByRole("button", { name: /Avisos: 1 aviso sin leer/ }).click();
    await page.getByRole("menuitem", { name: /RRHH ha respondido tu consulta/ }).click();
    await expect(page).toHaveURL(/\/faq\/my-queries$/);
    await expect(
      page.getByTestId("my-query").filter({ hasText: "horario del comedor" }),
    ).toContainText("El comedor abre de 13:00 a 15:30.");
    await expect(page.getByRole("button", { name: "Avisos", exact: true })).toBeVisible();
  });
});
