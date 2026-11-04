import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/countries/types";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.toLowerCase() : undefined))
  .refine((value) => value === undefined || z.email().safeParse(value).success, {
    error: "email",
  });

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, { error: "orgNameLength" }).max(120, { error: "orgNameLength" }),
  country: z.enum(COUNTRY_CODES, { error: "country" }),
  legalName: optionalText(200),
  taxId: optionalText(40),
  address: optionalText(300),
  privacyEmail: optionalEmail,
});

export const updateOrganizationSchema = createOrganizationSchema.extend({
  orgId: z.uuid(),
  timezone: z.string().trim().min(3, { error: "required" }),
  currency: z.enum(["EUR", "CRC", "USD"], { error: "required" }),
  cvRetentionMonths: z.coerce
    .number({ error: "retentionMonths" })
    .int({ error: "retentionMonths" })
    .min(1, { error: "retentionMonths" })
    .max(60, { error: "retentionMonths" }),
});
