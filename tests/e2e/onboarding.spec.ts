import { expect, test } from "@playwright/test";
import { PASSWORD, fillSignup, sidebar, signOut, uniqueEmail } from "./helpers";

test.describe("alta de empresa e invitaciones", () => {
  test("una empresa nueva se registra, invita a un empleado y cada rol ve solo lo suyo", async ({
    page,
  }) => {
    const adminEmail = uniqueEmail("admin");
    const employeeEmail = uniqueEmail("empleado");
    const orgName = `Empresa E2E ${Date.now()}`;

    // 1. Registro del admin y alta de la empresa.
    await page.goto("/signup");
    await fillSignup(page, { fullName: "Ana Admin", email: adminEmail });
    await expect(page).toHaveURL(/\/app\/new$/);
    await page.getByLabel("Nombre de la empresa").fill(orgName);
    await page.getByRole("button", { name: "Crear empresa" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    const orgUrl = new URL(page.url()).pathname;
    expect(orgUrl).toMatch(/^\/app\/empresa-e2e-\d+/);

    const adminNav = sidebar(page);
    await expect(adminNav.getByRole("link", { name: /Puestos y ofertas/ })).toBeVisible();
    await expect(adminNav.getByRole("link", { name: /Usuarios/ })).toBeVisible();

    // 2. Invitación a un empleado (sin SMTP: enlace para copiar).
    await adminNav.getByRole("link", { name: /Usuarios/ }).click();
    await page.getByRole("button", { name: "Invitar" }).click();
    await page.getByLabel("Email").fill(employeeEmail);
    await page.getByRole("button", { name: "Crear invitación" }).click();
    const linkInput = page.getByTestId("invitation-link");
    await expect(linkInput).toBeVisible();
    const inviteLink = await linkInput.inputValue();
    expect(inviteLink).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    await page.getByRole("button", { name: "Hecho" }).click();
    await expect(page.getByRole("cell", { name: employeeEmail })).toBeVisible();

    await signOut(page);

    // 3. El empleado acepta la invitación creando su cuenta (sin código de acceso).
    await page.goto(new URL(inviteLink).pathname);
    await expect(page.getByText(`Te han invitado a unirte a ${orgName}`)).toBeVisible();
    await page.getByRole("link", { name: "Crear cuenta y unirme" }).click();
    await expect(page.getByLabel("Email")).toHaveValue(employeeEmail);
    await expect(page.getByLabel("Código de acceso")).toHaveCount(0);
    await fillSignup(page, { fullName: "Eva Empleada" });
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Eva" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(orgUrl);

    // 4. El empleado solo ve FAQ y formaciones.
    const employeeNav = sidebar(page);
    await expect(employeeNav.getByRole("link", { name: /Preguntas frecuentes/ })).toBeVisible();
    await expect(employeeNav.getByRole("link", { name: /Mis formaciones/ })).toBeVisible();
    await expect(employeeNav.getByRole("link", { name: /Puestos y ofertas/ })).toHaveCount(0);
    await expect(employeeNav.getByRole("link", { name: /Usuarios/ })).toHaveCount(0);

    // 5. Y no puede entrar por URL a las zonas de RRHH o de admin.
    for (const path of ["/settings/members", "/settings/organization", "/jobs"]) {
      await page.goto(`${orgUrl}${path}`);
      await expect(
        page.getByRole("heading", { name: "No hemos encontrado esta página" }),
      ).toBeVisible();
    }

    // 6. La invitación ya no se puede reutilizar.
    await page.goto(new URL(inviteLink).pathname);
    await expect(page.getByText("Esta invitación ya se ha utilizado.")).toBeVisible();

    // 7. El admin ve al empleado activo en la lista.
    await signOut(page);
    await page.goto(`/login?next=${encodeURIComponent(`${orgUrl}/settings/members`)}`);
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    const row = page.getByTestId("member-row").filter({ hasText: "Eva Empleada" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Activo")).toBeVisible();
  });
});

test.describe("acceso", () => {
  test("las rutas de la app exigen sesión", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
  });

  test("el login informa de credenciales incorrectas", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail("nadie"));
    await page.getByLabel("Contraseña").fill("NoExiste123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("El email o la contraseña no son correctos.")).toBeVisible();
  });

  test("el registro abierto exige el código de acceso", async ({ page }) => {
    test.skip(!process.env.SIGNUP_ACCESS_CODE, "Sin SIGNUP_ACCESS_CODE el registro es libre");
    await page.goto("/signup");
    await page.getByLabel("Nombre y apellidos").fill("Sin Código");
    await page.getByLabel("Email").fill(uniqueEmail("sincodigo"));
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel("Código de acceso").fill("codigo-incorrecto");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText(/El código de acceso no es válido/)).toBeVisible();
  });
});
