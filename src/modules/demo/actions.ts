"use server";

/**
 * "Crear empresa demo": una empresa nueva, marcada como demo, con datos
 * ficticios ya generados en todos los módulos. Se borra sola a los 14 días.
 */
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/auth/hr-context";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { demoContent } from "./content";
import { seedDemoOrganization } from "./seed";

const inputSchema = z.object({ country: z.enum(["ES", "CR"]) });

export async function createDemoOrganizationAction(input: {
  country: "ES" | "CR";
}): Promise<FormState<{ slug: string; partial: boolean }>> {
  const t = await getTranslations("demo");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  await requireUser("/app/new");
  const supabase = await createClient();
  const content = demoContent(parsed.data.country);

  const { data: org, error } = await supabase.rpc("create_demo_organization", {
    p_name: content.orgName,
    p_country: parsed.data.country,
  });
  if (error || !org) {
    return {
      status: "error",
      message: error?.code === "22023" ? t("errors.limit") : t("errors.generic"),
    };
  }
  await supabase.from("organizations").update({ legal_name: content.legalName }).eq("id", org.id);

  let partial = false;
  try {
    const hr = await requireHrContext(org.id);
    if (!hr) throw new Error("Demo: sin contexto de RRHH");
    await seedDemoOrganization(hr, content);
  } catch (seedError) {
    // La empresa ya existe y se puede usar; avisamos de que faltan datos.
    console.error("[demo] Error al preparar los datos:", seedError);
    partial = true;
  }
  revalidatePath("/app", "layout");
  return { status: "success", data: { slug: org.slug, partial } };
}
