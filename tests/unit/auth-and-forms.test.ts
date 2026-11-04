import { describe, expect, it } from "vitest";
import {
  hashInvitationToken,
  generateInvitationToken,
  invitationExpiry,
} from "@/lib/invitations/token";
import { isHrRole, isAdminRole, isMemberRole } from "@/lib/auth/roles";
import { MAIN_NAV, SETTINGS_NAV, navForRole } from "@/lib/navigation";
import {
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  signupSchema,
} from "@/modules/auth/schemas";
import { inviteMemberSchema } from "@/modules/members/schemas";
import { updateOrganizationSchema } from "@/modules/organizations/schemas";

describe("redirecciones seguras", () => {
  it("solo acepta rutas internas", () => {
    expect(safeNextPath("/app/demo")).toBe("/app/demo");
    expect(safeNextPath("https://evil.com")).toBe("/app");
    expect(safeNextPath("//evil.com")).toBe("/app");
    expect(safeNextPath("/\\evil.com")).toBe("/app");
    expect(safeNextPath(undefined)).toBe("/app");
  });
});

describe("validación de formularios", () => {
  const validSignup = {
    fullName: "Ana Pérez",
    email: "  Ana@Ejemplo.COM ",
    password: "segura123",
    acceptTerms: "on",
  };

  it("normaliza el email y exige aceptar los términos", () => {
    const parsed = signupSchema.parse(validSignup);
    expect(parsed.email).toBe("ana@ejemplo.com");
    const result = signupSchema.safeParse({ ...validSignup, acceptTerms: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("acceptTerms");
  });

  it("exige contraseñas de 8+ caracteres con letras y números", () => {
    for (const password of ["corta1", "sololetras", "12345678"]) {
      const result = signupSchema.safeParse({ ...validSignup, password });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("passwordMin");
    }
  });

  it("comprueba que las contraseñas coinciden", () => {
    const result = resetPasswordSchema.safeParse({
      password: "segura123",
      confirmPassword: "otra1234",
    });
    expect(result.error?.issues[0]).toMatchObject({
      message: "passwordMismatch",
      path: ["confirmPassword"],
    });
  });

  it("valida invitaciones y datos de empresa", () => {
    expect(loginSchema.safeParse({ email: "no-es-email", password: "x" }).success).toBe(false);
    expect(
      inviteMemberSchema.safeParse({
        orgId: "00000000-0000-4000-8000-000000000000",
        email: "rrhh@ejemplo.com",
        role: "superadmin",
      }).error?.issues[0]?.message,
    ).toBe("role");
    const org = updateOrganizationSchema.safeParse({
      orgId: "00000000-0000-4000-8000-000000000000",
      name: "Demo",
      country: "ES",
      timezone: "Europe/Madrid",
      currency: "EUR",
      cvRetentionMonths: "99",
    });
    expect(org.error?.issues[0]?.message).toBe("retentionMonths");
  });
});

describe("tokens de invitación", () => {
  it("son aleatorios, de 256 bits, y en BD solo se guarda su SHA-256", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(Buffer.from(a.token, "base64url")).toHaveLength(32);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(a.token)).toBe(a.hash);
  });

  it("caducan a los 7 días", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(invitationExpiry(from).toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("roles y navegación", () => {
  it("admin tiene todo lo de RRHH", () => {
    expect(isHrRole("admin")).toBe(true);
    expect(isHrRole("hr")).toBe(true);
    expect(isHrRole("employee")).toBe(false);
    expect(isAdminRole("hr")).toBe(false);
    expect(isMemberRole("owner")).toBe(false);
  });

  it("el empleado solo ve inicio, FAQ y sus formaciones", () => {
    expect(navForRole(MAIN_NAV, "employee").map((item) => item.key)).toEqual([
      "home",
      "faq",
      "myTrainings",
    ]);
    expect(navForRole(SETTINGS_NAV, "employee")).toEqual([]);
  });

  it("RRHH ve los módulos de RRHH pero no los ajustes de la empresa", () => {
    const keys = navForRole(MAIN_NAV, "hr").map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining(["jobs", "candidates", "onboarding", "hrQueries", "trainings"]),
    );
    expect(navForRole(SETTINGS_NAV, "hr")).toEqual([]);
    expect(navForRole(SETTINGS_NAV, "admin").map((item) => item.key)).toEqual([
      "organization",
      "members",
      "aiUsage",
    ]);
  });
});
