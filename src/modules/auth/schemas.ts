import { z } from "zod";

// Los mensajes son claves de messages/es.json → "validation".

/** Se normaliza (espacios, mayúsculas) ANTES de validar el formato. */
export const emailSchema = z
  .string({ error: "email" })
  .trim()
  .toLowerCase()
  .max(254, { error: "email" })
  .pipe(z.email({ error: "email" }));

/** Mismo criterio que Supabase Auth (config.toml): 8+ caracteres con letras y números. */
export const passwordSchema = z
  .string()
  .min(8, { error: "passwordMin" })
  .max(72, { error: "passwordMax" })
  .regex(/[A-Za-z]/, { error: "passwordMin" })
  .regex(/[0-9]/, { error: "passwordMin" });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "required" }),
  next: z.string().optional(),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, { error: "nameLength" }).max(120, { error: "nameLength" }),
  email: emailSchema,
  password: passwordSchema,
  accessCode: z.string().trim().optional(),
  invite: z.string().trim().optional(),
  acceptTerms: z.literal("on", { error: "acceptTerms" }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    error: "passwordMismatch",
    path: ["confirmPassword"],
  });

/** Solo rutas internas: evita redirecciones abiertas a otros dominios. */
export function safeNextPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
