import { type Page, expect } from "@playwright/test";

export const PASSWORD = "Segura123";
export const ACCESS_CODE = process.env.SIGNUP_ACCESS_CODE ?? "";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.example.com`;
}

/** Rellena el formulario de registro (el email puede venir fijado por una invitación). */
export async function fillSignup(
  page: Page,
  { fullName, email }: { fullName: string; email?: string },
) {
  await page.getByLabel("Nombre y apellidos").fill(fullName);
  if (email) await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  const accessCode = page.getByLabel("Código de acceso");
  if ((await accessCode.count()) > 0) await accessCode.fill(ACCESS_CODE);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "Navegación principal" }).first();
}
