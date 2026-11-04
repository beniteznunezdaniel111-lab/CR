"use server";

/**
 * Privacidad: borrar los datos de un miembro en la empresa y cerrar una empresa.
 * Son decisiones de una persona admin (RPCs con su sesión); el servidor solo usa
 * su clave para borrar los ficheros de Storage de la empresa que se cierra.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRoleContext } from "@/lib/auth/hr-context";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { type FormState, formDataToObject, formError } from "@/lib/forms";
import { orgPath } from "@/lib/navigation";
import { removeOrgFiles } from "./storage";

const eraseSchema = z.object({ orgId: z.uuid(), userId: z.uuid() });
const closeSchema = z.object({ orgId: z.uuid(), confirmName: z.string().trim().min(1).max(200) });

export async function eraseMemberDataAction(input: {
  orgId: string;
  userId: string;
}): Promise<FormState> {
  const t = await getTranslations("privacy");
  const parsed = eraseSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const admin = await requireRoleContext(parsed.data.orgId, ADMIN_ROLES);
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const { error } = await admin.supabase.rpc("erase_member_data", {
    p_org_id: parsed.data.orgId,
    p_user_id: parsed.data.userId,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "P0001" ? t("errors.lastAdmin") : t("errors.generic"),
    };
  }
  revalidatePath(orgPath(admin.org.slug), "layout");
  return { status: "success", message: t("erased") };
}

export async function closeOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("privacy");
  const parsed = closeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return formError(formData, { fieldErrors: { confirmName: ["closeConfirm"] } });
  }
  const admin = await requireRoleContext(parsed.data.orgId, ADMIN_ROLES);
  if (!admin) return formError(formData, { message: t("errors.forbidden") });
  if (parsed.data.confirmName !== admin.org.name) {
    return formError(formData, { fieldErrors: { confirmName: ["closeConfirm"] } });
  }

  // Primero los ficheros: si fallan, la empresa sigue intacta y se puede reintentar.
  try {
    await removeOrgFiles(admin.org.id);
  } catch (error) {
    console.error("[privacidad] Error al borrar ficheros:", error);
    return formError(formData, { message: t("errors.files") });
  }
  const { error } = await admin.supabase.rpc("close_organization", {
    p_org_id: admin.org.id,
    p_confirm_name: parsed.data.confirmName,
  });
  if (error) return formError(formData, { message: t("errors.generic") });
  redirect("/app");
}
