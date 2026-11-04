"use server";

/**
 * Acciones de la FAQ interna. Todo se hace con la sesión de la persona (RLS):
 * documentos y ficheros (admin y RRHH), conversaciones propias, consultas a
 * RRHH y avisos. La auditoría no guarda textos ni datos personales.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { recordAuditEvent } from "@/lib/audit";
import { requireHrContext, requireMemberContext } from "@/lib/auth/hr-context";
import { isSupportedMime, mimeFromFilename } from "@/lib/extraction";
import { type FormState, formDataToObject, formError, zodFieldErrors } from "@/lib/forms";
import { orgPath } from "@/lib/navigation";
import { KB_BUCKET, KB_PROCESSING_STALE_MS, type KbProcessingError } from "./constants";
import { processKbDocument } from "./ingest";
import {
  type KbDocumentRef,
  type KbUploadInput,
  conversationRefSchema,
  hrAnswerSchema,
  hrQuerySchema,
  kbDocumentRefSchema,
  kbUploadSchema,
  notificationsReadSchema,
} from "./schemas";

function revalidateFaq(slug: string) {
  revalidatePath(orgPath(slug, "/faq"), "layout");
  revalidatePath(orgPath(slug, "/hr-queries"));
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------
export type PreparedKbUpload = { documentId: string; path: string; token: string };

/**
 * Registra el documento y devuelve una URL firmada de subida: el navegador sube
 * el fichero directo a Storage (la política del bucket exige ser RRHH de la empresa).
 */
export async function prepareKbUploadAction(
  input: KbUploadInput,
): Promise<FormState<PreparedKbUpload>> {
  const t = await getTranslations("faq.documents");
  const parsed = kbUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: t("errors.invalid"),
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const { orgId, title, docType, file } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const mime = isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name);
  if (!mime) return { status: "error", message: t("errors.fileType") };

  const documentId = randomUUID();
  const path = `${orgId}/${documentId}.${mime === "application/pdf" ? "pdf" : "docx"}`;
  const { error } = await hr.supabase.from("kb_documents").insert({
    id: documentId,
    org_id: orgId,
    title,
    doc_type: docType,
    file_path: path,
    file_mime: mime,
    file_size: file.size,
  });
  if (error) return { status: "error", message: t("errors.upload") };

  const { data: signed, error: signError } = await hr.supabase.storage
    .from(KB_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    await hr.supabase.from("kb_documents").delete().eq("id", documentId);
    return { status: "error", message: t("errors.upload") };
  }

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "kb_document.uploaded",
    entityType: "kb_document",
    entityId: documentId,
    details: { mime, size: file.size, doc_type: docType },
  });
  revalidateFaq(hr.org.slug);
  return { status: "success", data: { documentId, path, token: signed.token } };
}

export type KbProcessOutcome = { ready: true; chunks: number } | { ready: false; error: string };

/** Procesa (o reprocesa) un documento: texto, fragmentos y embeddings. */
export async function processKbDocumentAction(
  input: KbDocumentRef,
): Promise<FormState<KbProcessOutcome>> {
  const t = await getTranslations("faq.documents");
  const parsed = kbDocumentRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  // Evita dos procesados simultáneos del mismo documento.
  const staleBefore = new Date(Date.now() - KB_PROCESSING_STALE_MS).toISOString();
  const { data: current } = await hr.supabase
    .from("kb_documents")
    .select("status, updated_at")
    .eq("id", parsed.data.documentId)
    .eq("org_id", parsed.data.orgId)
    .maybeSingle();
  if (!current) return { status: "error", message: t("errors.notFound") };
  if (current.status === "processing" && current.updated_at > staleBefore) {
    return { status: "error", message: t("errors.alreadyProcessing") };
  }

  const result = await processKbDocument(hr, parsed.data.documentId);
  revalidateFaq(hr.org.slug);
  if (!result) return { status: "error", message: t("errors.notFound") };
  if (!result.ok) {
    const message = t(`processingErrors.${result.error satisfies KbProcessingError}`);
    return { status: "success", data: { ready: false, error: message } };
  }
  return { status: "success", data: { ready: true, chunks: result.chunks } };
}

/** Borra el documento, sus fragmentos y el fichero original. */
export async function deleteKbDocumentAction(input: KbDocumentRef): Promise<FormState> {
  const t = await getTranslations("faq.documents");
  const parsed = kbDocumentRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const { data: doc } = await hr.supabase
    .from("kb_documents")
    .select("id, file_path")
    .eq("id", parsed.data.documentId)
    .eq("org_id", parsed.data.orgId)
    .maybeSingle();
  if (!doc) return { status: "error", message: t("errors.notFound") };

  // Primero el fichero: si falla, el documento sigue (y se puede reintentar).
  const { error: storageError } = await hr.supabase.storage.from(KB_BUCKET).remove([doc.file_path]);
  if (storageError) return { status: "error", message: t("errors.delete") };
  const { error } = await hr.supabase.from("kb_documents").delete().eq("id", doc.id);
  if (error) return { status: "error", message: t("errors.delete") };

  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "kb_document.deleted",
    entityType: "kb_document",
    entityId: doc.id,
  });
  revalidateFaq(hr.org.slug);
  return { status: "success", message: t("deleted") };
}

// ---------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------
export async function deleteConversationAction(input: {
  orgId: string;
  conversationId: string;
}): Promise<FormState> {
  const t = await getTranslations("faq.chat");
  const parsed = conversationRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const member = await requireMemberContext(parsed.data.orgId);
  if (!member) return { status: "error", message: t("errors.generic") };
  const { error } = await member.supabase
    .from("faq_conversations")
    .delete()
    .eq("id", parsed.data.conversationId)
    .eq("org_id", parsed.data.orgId);
  if (error) return { status: "error", message: t("errors.generic") };
  revalidatePath(orgPath(member.org.slug, "/faq"));
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Consultas a RRHH
// ---------------------------------------------------------------------------
export async function createHrQueryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("faq.askHr");
  const parsed = hrQuerySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  }
  const member = await requireMemberContext(parsed.data.orgId);
  if (!member) return formError(formData, { message: t("errors.forbidden") });

  const { data, error } = await member.supabase
    .from("hr_queries")
    .insert({ org_id: parsed.data.orgId, question: parsed.data.question })
    .select("id")
    .single();
  if (error || !data) return formError(formData, { message: t("errors.generic") });

  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: member.user.id,
    action: "hr_query.created",
    entityType: "hr_query",
    entityId: data.id,
  });
  revalidatePath(orgPath(member.org.slug, "/faq/my-queries"));
  revalidatePath(orgPath(member.org.slug, "/hr-queries"));
  return { status: "success", message: t("sent") };
}

export async function answerHrQueryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("hrQueries");
  const parsed = hrAnswerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  }
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });

  const { error } = await hr.supabase.rpc("answer_hr_query", {
    p_query_id: parsed.data.queryId,
    p_answer: parsed.data.answer,
  });
  if (error) return formError(formData, { message: t("errors.generic") });

  revalidatePath(orgPath(hr.org.slug, "/hr-queries"));
  return { status: "success", message: t("answered") };
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
/** Marca como leídos los avisos indicados (o todos los de la empresa). */
export async function markNotificationsReadAction(input: {
  orgId: string;
  ids?: string[];
}): Promise<FormState> {
  const parsed = notificationsReadSchema.safeParse(input);
  if (!parsed.success) return { status: "error" };
  const member = await requireMemberContext(parsed.data.orgId);
  if (!member) return { status: "error" };

  let query = member.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("org_id", parsed.data.orgId)
    .is("read_at", null);
  if (parsed.data.ids?.length) query = query.in("id", parsed.data.ids);
  await query;
  revalidatePath(orgPath(member.org.slug), "layout");
  return { status: "success" };
}
