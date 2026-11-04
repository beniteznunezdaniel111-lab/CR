import { expect, test } from "@playwright/test";
import { selectOption, signUpAdminWithOrg } from "./helpers";

test.describe("formación y evaluaciones", () => {
  test.setTimeout(150_000);

  test("generar con IA → publicar → asignar con aviso → completar módulos → test con nota del servidor", async ({
    page,
  }) => {
    const orgUrl = await signUpAdminWithOrg(page, {
      fullName: "Teresa Formación",
      orgName: `Empresa Formación ${Date.now()}`,
    });
    const title = "Formación: Protección de datos en el día a día";

    // 1. Generar la formación por pasos (índice, módulos y test).
    await page.goto(`${orgUrl}/trainings`);
    await page.getByRole("link", { name: "Nueva formación" }).first().click();
    await page.getByLabel("Tema").fill("Protección de datos en el día a día");
    await selectOption(page, "Número de módulos", "2");
    await selectOption(page, "Preguntas del test", "3");
    await page.getByRole("button", { name: "Generar formación" }).click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("training-module")).toHaveCount(2);

    // 2. El test muestra las respuestas correctas a RRHH.
    await page.getByRole("tab", { name: "Test" }).click();
    await expect(page.getByTestId("quiz-question")).toHaveCount(3);
    await expect(page.getByText(/3 preguntas · aprobado con 70 %/)).toBeVisible();

    // 3. Publicar y asignar (a sí misma, para hacerla después).
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText("Formación publicada. Ya puedes asignarla.")).toBeVisible();
    await page.getByRole("tab", { name: "Asignaciones y progreso" }).click();
    await page.getByRole("button", { name: "Asignar", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Teresa Formación").check();
    await dialog.getByRole("button", { name: "Asignar", exact: true }).click();
    await expect(page.getByText("Asignada a 1 persona.")).toBeVisible();
    await expect(
      page.getByTestId("training-assignment").filter({ hasText: "Teresa Formación" }),
    ).toContainText("Sin empezar");

    // 4. El aviso lleva a la formación asignada.
    await page.getByRole("button", { name: /Avisos: 1 aviso sin leer/ }).click();
    await page.getByRole("menuitem", { name: `Te han asignado la formación «${title}»` }).click();
    await expect(page).toHaveURL(/\/my-trainings\/[0-9a-f-]{36}$/);

    // 5. Leer y completar el primer módulo.
    await page.getByRole("button", { name: /^1\. / }).click();
    await page.getByRole("button", { name: "Marcar como completado" }).click();
    await expect(page.getByText("Completado")).toBeVisible();
    await page.getByRole("button", { name: "Módulos" }).first().click();
    await expect(page.getByText("1 de 2 módulos")).toBeVisible();

    // 6. Primer intento: todas mal (la última opción nunca es la correcta aquí).
    await page.getByRole("button", { name: "Hacer el test" }).click();
    const questions = page.getByRole("group");
    for (let index = 0; index < 3; index++) {
      await questions.nth(index).getByRole("radio").nth(3).check();
    }
    await page.getByRole("button", { name: "Entregar" }).click();
    await expect(page.getByText("Has sacado un 0 % (0 de 3).")).toBeVisible();
    await expect(page.getByText(/Aún no has aprobado/)).toBeVisible();
    await expect(page.getByTestId("attempt-result").first()).toContainText("Respuesta correcta:");

    // 7. Segundo intento: todas bien → aprobado y mejor nota 100 %.
    await page.getByRole("button", { name: "Volver a intentarlo" }).click();
    for (let index = 0; index < 3; index++) {
      await questions
        .nth(index)
        .getByRole("radio")
        .nth(index % 4)
        .check();
    }
    await page.getByRole("button", { name: "Entregar" }).click();
    await expect(page.getByText("¡Aprobado!")).toBeVisible();
    await expect(page.getByText("Mejor nota: 100 %")).toBeVisible();

    // 8. RRHH ve el progreso y el test queda bloqueado (se duplica para cambiarlo).
    await page.goto(`${orgUrl}/trainings`);
    const row = page.getByTestId("training-row").filter({ hasText: title });
    await expect(row).toContainText("Publicada");
    await expect(row).toContainText("100 %");
    await row.getByRole("link", { name: title }).click();
    await page.getByRole("tab", { name: "Test" }).click();
    await expect(page.getByText(/Este test ya tiene intentos/)).toBeVisible();
    await page.getByRole("button", { name: "Duplicar" }).click();
    await expect(page.getByRole("heading", { name: `${title} (copia)`, level: 1 })).toBeVisible();
    await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  });
});
