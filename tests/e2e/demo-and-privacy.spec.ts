import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fillSignup, uniqueEmail } from "./helpers";

test.describe("empresa demo, inicio por rol, uso de IA y privacidad", () => {
  test.setTimeout(180_000);

  test("crear una empresa demo con datos en todos los módulos y cerrarla", async ({ page }) => {
    await page.goto("/signup");
    await fillSignup(page, { fullName: "Diego Demo", email: uniqueEmail("demo") });
    await expect(page).toHaveURL(/\/app\/new$/);

    // 1. Crear la demo de España: datos ficticios ya generados en cada módulo.
    await page.getByRole("button", { name: "Demo de España" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Diego" })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("Demo", { exact: true })).toBeVisible();

    // 2. Inicio adaptado: pendientes de RRHH y lo asignado a la persona.
    await expect(
      page.getByTestId("dashboard-pending").filter({ hasText: "2 candidaturas por revisar" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("dashboard-pending").filter({ hasText: "1 formación pendiente" }),
    ).toBeVisible();
    const orgUrl = new URL(page.url()).pathname;

    // 3. Puestos, candidaturas analizadas y onboarding en curso.
    await page.goto(`${orgUrl}/jobs`);
    await page.getByRole("link", { name: "Técnico/a de logística" }).click();
    await expect(page.getByRole("heading", { name: "Técnico/a de logística" })).toBeVisible();
    await page.goto(`${new URL(page.url()).pathname}/candidates`);
    await expect(page.getByRole("link", { name: "Ana Martín Ruiz" })).toBeVisible();
    await page.goto(`${orgUrl}/onboarding`);
    await expect(
      page.getByRole("row").filter({ hasText: "Persona de ejemplo (ficticia)" }),
    ).toContainText(/3\/\d+/);

    // 4. La FAQ responde con la política ficticia y su cita.
    await page.goto(`${orgUrl}/faq`);
    await page.getByLabel("Tu pregunta").fill("¿Cuántos días de vacaciones tengo al año?");
    await page.getByRole("button", { name: "Preguntar", exact: true }).click();
    const source = page.getByTestId("faq-source").first();
    await expect(source).toContainText("Política de vacaciones, permisos y teletrabajo");
    await expect(source).toContainText("pág. 1");

    // 5. La formación asignada aparece en «Mis formaciones».
    await page.goto(`${orgUrl}/my-trainings`);
    await expect(page.getByTestId("my-training")).toContainText(
      "Formación: Vacaciones, permisos y teletrabajo en Logística Iberia",
    );

    // 6. Uso de IA: las llamadas de la demo constan (modo simulado, sin coste).
    await page.goto(`${orgUrl}/settings/ai-usage`);
    await expect(page.getByRole("heading", { name: "Uso de IA", level: 1 })).toBeVisible();
    await expect(page.getByTestId("ai-spent")).toContainText("20,00");
    await expect(page.getByTestId("ai-feature").first()).toBeVisible();
    await expect(page.getByTestId("ai-call").first()).toBeVisible();

    // 7. Exportar mis datos (JSON).
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Exportar mis datos" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(exported.person.name).toBe("Diego Demo");
    expect(exported.trainings).toHaveLength(1);
    expect(exported.faqConversations[0].messages.length).toBeGreaterThanOrEqual(2);

    // 8. Cerrar la empresa: hay que escribir su nombre; después vuelve al alta.
    await page.goto(`${orgUrl}/settings/organization`);
    await page.getByRole("button", { name: "Cerrar la empresa" }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Cerrar definitivamente" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Nombre de la empresa").fill("Logística Iberia (demo)");
    await confirm.click();
    await expect(page).toHaveURL(/\/app\/new$/, { timeout: 30_000 });
  });
});
