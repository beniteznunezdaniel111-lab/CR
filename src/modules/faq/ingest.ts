import "server-only";
import { embedTexts, isAiError, toPgVector } from "@/lib/ai";
import { recordAuditEvent } from "@/lib/audit";
import type { HrContext } from "@/lib/auth/hr-context";
import { extractDocumentPages, isExtractionError } from "@/lib/extraction";
import { chunkDocument, embeddingTextFor } from "./chunking";
import { KB_BUCKET, KB_MAX_CHUNKS, type KbProcessingError } from "./constants";

const INSERT_BATCH = 50;

export type KbProcessResult =
  { ok: true; chunks: number; pages: number | null } | { ok: false; error: KbProcessingError };

/**
 * Procesa un documento de la FAQ con la sesión de la persona de RRHH:
 * descarga → texto por páginas → fragmentos → embeddings → guardado.
 * Reprocesar sustituye los fragmentos anteriores. El documento solo pasa a
 * "listo" (visible para la plantilla) si todo ha ido bien.
 */
export async function processKbDocument(
  hr: HrContext,
  documentId: string,
): Promise<KbProcessResult | null> {
  const { data: doc } = await hr.supabase
    .from("kb_documents")
    .select("id, org_id, title, file_path, file_mime")
    .eq("id", documentId)
    .eq("org_id", hr.org.id)
    .maybeSingle();
  if (!doc) return null;

  await hr.supabase
    .from("kb_documents")
    .update({ status: "processing", error: null })
    .eq("id", documentId);

  const fail = async (error: KbProcessingError): Promise<KbProcessResult> => {
    await hr.supabase.from("kb_documents").update({ status: "failed", error }).eq("id", documentId);
    await recordAuditEvent({
      orgId: doc.org_id,
      actorId: hr.user.id,
      action: "kb_document.processing_failed",
      entityType: "kb_document",
      entityId: documentId,
      details: { error },
    });
    return { ok: false, error };
  };

  const { data: blob, error: downloadError } = await hr.supabase.storage
    .from(KB_BUCKET)
    .download(doc.file_path);
  if (downloadError || !blob) return fail("storage_error");

  let extracted: Awaited<ReturnType<typeof extractDocumentPages>>;
  try {
    extracted = await extractDocumentPages(new Uint8Array(await blob.arrayBuffer()), doc.file_mime);
  } catch (error) {
    return fail(isExtractionError(error) ? error.code : "unreadable");
  }

  const chunks = chunkDocument(extracted.pages);
  if (chunks.length === 0) return fail("no_text");
  if (chunks.length > KB_MAX_CHUNKS) return fail("too_long");

  let embedded: { vectors: number[][]; model: string };
  try {
    embedded = await embedTexts(
      chunks.map((chunk) => embeddingTextFor(doc.title, chunk)),
      { inputType: "document", ctx: hr.aiContext, feature: "faq" },
    );
  } catch (error) {
    if (isAiError(error) && (error.code === "budget_exceeded" || error.code === "not_configured")) {
      return fail(error.code);
    }
    return fail("embeddings_failed");
  }

  const { error: deleteError } = await hr.supabase
    .from("kb_chunks")
    .delete()
    .eq("document_id", documentId);
  if (deleteError) return fail("save_failed");

  for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
    const rows = chunks.slice(start, start + INSERT_BATCH).map((chunk, offset) => ({
      org_id: doc.org_id,
      document_id: documentId,
      chunk_index: chunk.index,
      heading: chunk.heading,
      blocks: chunk.blocks,
      content: chunk.content,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
      token_count: chunk.tokenCount,
      embedding: toPgVector(embedded.vectors[start + offset]!),
    }));
    const { error } = await hr.supabase.from("kb_chunks").insert(rows);
    if (error) {
      await hr.supabase.from("kb_chunks").delete().eq("document_id", documentId);
      return fail("save_failed");
    }
  }

  const { error: readyError } = await hr.supabase
    .from("kb_documents")
    .update({
      status: "ready",
      error: null,
      pages: extracted.totalPages,
      chunk_count: chunks.length,
      embedding_model: embedded.model,
    })
    .eq("id", documentId);
  if (readyError) return fail("save_failed");

  await recordAuditEvent({
    orgId: doc.org_id,
    actorId: hr.user.id,
    action: "kb_document.processed",
    entityType: "kb_document",
    entityId: documentId,
    details: { chunks: chunks.length, pages: extracted.totalPages, model: embedded.model },
  });
  return { ok: true, chunks: chunks.length, pages: extracted.totalPages };
}
