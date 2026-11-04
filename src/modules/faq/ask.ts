import "server-only";
import { getTranslations } from "next-intl/server";
import {
  embedTexts,
  getEmbeddingSettings,
  isAiError,
  streamCitedAnswer,
  toPgVector,
} from "@/lib/ai";
import { faqAnswerV1 } from "@/lib/ai/prompts/faq/answer.v1";
import type { MemberContext } from "@/lib/auth/hr-context";
import type { Json } from "@/lib/supabase/database.types";
import {
  AnswerAssembler,
  ERROR_CONTENT,
  type FaqOutcome,
  type FaqSegment,
  type FaqSource,
  NOT_FOUND_CONTENT,
  type RetrievedChunk,
  buildHistory,
  searchResultTitle,
} from "./answer";
import { MATCH_COUNT } from "./constants";

/** Mensaje tal y como lo pinta el chat. */
export type FaqMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  outcome: FaqOutcome | null;
  segments: FaqSegment[] | null;
  sources: FaqSource[];
  createdAt: string;
};

/** Eventos que recibe el navegador (una línea JSON por evento). */
export type AskEvent =
  | { type: "start"; conversationId: string; title: string; question: FaqMessageView }
  | { type: "text"; block: number; text: string }
  | { type: "source"; source: FaqSource }
  | { type: "ref"; block: number; n: number }
  | { type: "final"; message: FaqMessageView }
  | { type: "error"; message: string };

const MESSAGE_COLUMNS = "id, role, content, outcome, segments, sources, created_at";

type MessageRow = {
  id: string;
  role: string;
  content: string;
  outcome: FaqOutcome | null;
  segments: Json | null;
  sources: Json;
  created_at: string;
};

export function toMessageView(row: MessageRow): FaqMessageView {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    outcome: row.outcome,
    segments: (row.segments as FaqSegment[] | null) ?? null,
    sources: (row.sources as FaqSource[] | null) ?? [],
    createdAt: row.created_at,
  };
}

/**
 * Responde una pregunta de la FAQ y va enviando eventos:
 *   1. guarda la pregunta (con su embedding, para las estadísticas anónimas);
 *   2. busca fragmentos relevantes (híbrida, con la sesión de la persona);
 *   3. sin fragmentos → "no encuentro esto" SIN llamar a la IA;
 *   4. con fragmentos → respuesta en streaming con citas; sin citas válidas → "no lo sé".
 */
export async function askFaq(
  member: MemberContext,
  input: { conversationId?: string | null; question: string },
  send: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const t = await getTranslations("faq.chat");
  const { supabase, org } = member;
  const question = input.question.trim();

  // 1. Conversación (propia: la RLS oculta las ajenas) e historial.
  let conversation: { id: string; title: string } | null = null;
  if (input.conversationId) {
    const { data } = await supabase
      .from("faq_conversations")
      .select("id, title")
      .eq("id", input.conversationId)
      .eq("org_id", org.id)
      .maybeSingle();
    conversation = data;
  }
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (conversation) {
    const { data: previous } = await supabase
      .from("faq_messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(8);
    history = buildHistory([...(previous ?? [])].reverse());
  } else {
    const { data: created, error } = await supabase
      .from("faq_conversations")
      .insert({ org_id: org.id, title: question.slice(0, 120) })
      .select("id, title")
      .single();
    if (error || !created) {
      send({ type: "error", message: t("errors.generic") });
      return;
    }
    conversation = created;
  }

  const saveMessage = async (row: {
    role: "user" | "assistant";
    content: string;
    outcome?: FaqOutcome;
    segments?: FaqSegment[] | null;
    sources?: FaqSource[];
    question_embedding?: string;
    embedding_model?: string;
  }): Promise<FaqMessageView> => {
    const { data, error } = await supabase
      .from("faq_messages")
      .insert({
        org_id: org.id,
        conversation_id: conversation!.id,
        role: row.role,
        content: row.content,
        outcome: row.outcome ?? null,
        segments: (row.segments ?? null) as Json,
        sources: (row.sources ?? []) as unknown as Json,
        question_embedding: row.question_embedding ?? null,
        embedding_model: row.embedding_model ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error || !data) throw new Error(`No se pudo guardar el mensaje: ${error?.message}`);
    return toMessageView(data);
  };

  let questionSaved = false;
  try {
    // 2. Embeddings: la pregunta sola (estadísticas) y, si hay historial, la
    //    pregunta con la anterior (para entender "¿y en verano?").
    const lastQuestion = [...history].reverse().find((message) => message.role === "user");
    const texts = lastQuestion
      ? [question, `${lastQuestion.content}\n${question}`.slice(-2000)]
      : [question];
    const embedded = await embedTexts(texts, {
      inputType: "query",
      ctx: member.aiContext,
      feature: "faq",
    });
    const questionView = await saveMessage({
      role: "user",
      content: question,
      question_embedding: toPgVector(embedded.vectors[0]!),
      embedding_model: embedded.model,
    });
    questionSaved = true;
    send({
      type: "start",
      conversationId: conversation.id,
      title: conversation.title,
      question: questionView,
    });

    // 3. Búsqueda híbrida con los permisos de la persona.
    const settings = await getEmbeddingSettings();
    const { data: matches, error: matchError } = await supabase.rpc("match_kb_chunks", {
      p_org_id: org.id,
      p_embedding: toPgVector(embedded.vectors[embedded.vectors.length - 1]!),
      p_query: question,
      p_embedding_model: embedded.model,
      p_match_count: MATCH_COUNT,
      p_min_similarity: settings.minSimilarity,
    });
    if (matchError) throw new Error(`Búsqueda fallida: ${matchError.message}`);

    if (!matches?.length) {
      const message = await saveMessage({
        role: "assistant",
        content: NOT_FOUND_CONTENT,
        outcome: "not_found",
      });
      send({ type: "final", message });
      return;
    }

    // 4. Respuesta con citas en streaming.
    const chunks: RetrievedChunk[] = matches.map((match) => ({
      chunkId: match.chunk_id,
      documentId: match.document_id,
      documentTitle: match.document_title,
      heading: match.heading,
      blocks: match.blocks,
      pageFrom: match.page_from,
      pageTo: match.page_to,
    }));
    const assembler = new AnswerAssembler(chunks);
    await streamCitedAnswer(
      faqAnswerV1,
      {
        question,
        history,
        results: chunks.map((chunk) => ({
          source: chunk.chunkId,
          title: searchResultTitle(chunk),
          blocks: chunk.blocks,
        })),
      },
      member.aiContext,
      (event) => {
        if (event.type === "text") {
          assembler.addText(event.block, event.text);
          send(event);
          return;
        }
        const ref = assembler.addCitation(event.block, event.citation);
        if (!ref) return;
        if (ref.source) send({ type: "source", source: ref.source });
        send({ type: "ref", block: event.block, n: ref.n });
      },
      { signal },
    );

    const answer = assembler.result();
    const message =
      answer.outcome === "answered"
        ? await saveMessage({
            role: "assistant",
            content: answer.text,
            outcome: "answered",
            segments: answer.segments,
            sources: answer.sources,
          })
        : await saveMessage({
            role: "assistant",
            content: NOT_FOUND_CONTENT,
            outcome: "not_found",
          });
    send({ type: "final", message });
  } catch (error) {
    if (signal?.aborted) return;
    console.error("[faq] Error al responder:", error);
    try {
      if (!questionSaved) await saveMessage({ role: "user", content: question });
      await saveMessage({ role: "assistant", content: ERROR_CONTENT, outcome: "error" });
    } catch {
      // Si tampoco se puede guardar, basta con avisar en pantalla.
    }
    send({
      type: "error",
      message: isAiError(error) ? error.userMessage : t("errors.generic"),
    });
  }
}
