"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { getCountry } from "@/lib/countries";
import { type FormState, formDataToObject, formError, zodFieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { createOrganizationSchema, updateOrganizationSchema } from "./schemas";

export async function createOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser("/app/new");
  const t = await getTranslations("newOrg");
  const parsed = createOrganizationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_country: parsed.data.country,
    p_legal_name: parsed.data.legalName,
    p_tax_id: parsed.data.taxId,
    p_address: parsed.data.address,
    p_privacy_email: parsed.data.privacyEmail,
  });
  if (error || !data) return formError(formData, { message: t("error") });

  redirect(`/app/${data.slug}`);
}

export async function updateOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const t = await getTranslations("orgSettings");
  const parsed = updateOrganizationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });

  const data = parsed.data;
  const country = getCountry(data.country);
  // Moneda y zona horaria deben ser válidas para el país elegido.
  const currency = country.currencies.includes(data.currency)
    ? data.currency
    : country.defaultCurrency;
  const timezone = country.timezones.includes(data.timezone)
    ? data.timezone
    : country.defaultTimezone;

  const supabase = await createClient();
  // RLS: solo un admin de esta empresa puede actualizarla (si no, 0 filas).
  const { data: updated, error } = await supabase
    .from("organizations")
    .update({
      name: data.name,
      country: data.country,
      legal_name: data.legalName ?? null,
      tax_id: data.taxId ?? null,
      address: data.address ?? null,
      privacy_email: data.privacyEmail ?? null,
      currency,
      timezone,
      cv_retention_months: data.cvRetentionMonths,
    })
    .eq("id", data.orgId)
    .select("slug")
    .maybeSingle();

  if (error || !updated) return formError(formData, { message: t("error") });
  revalidatePath(`/app/${updated.slug}`, "layout");
  return { status: "success", message: t("saved") };
}
