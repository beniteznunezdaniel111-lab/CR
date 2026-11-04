import "server-only";
import { type AiRunMeta, generateObject, isAiError } from "@/lib/ai";
import { trainingModuleV1 } from "@/lib/ai/prompts/trainings/module.v1";
import { trainingOutlineV1 } from "@/lib/ai/prompts/trainings/outline.v1";
import { trainingQuizV1 } from "@/lib/ai/prompts/trainings/quiz.v1";
import type { HrContext } from "@/lib/auth/hr-context";
import { extractDocumentPages, isExtractionError } from "@/lib/extraction";
import type { Json } from "@/lib/supabase/database.types";
import { MAX_STORED_SOURCE_CHARS, TRAINING_BUCKET } from "./constants";
import { buildSourceText } from "./sources";

/** Resultado de un paso: bien, o el motivo (mensaje ya preparado para la persona). */
export type StepResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: "ai"; message: string }
  | { ok: false; reason: "source"; code: string }
  | { ok: false; reason: "state"; code: "not_found" | "locked" | "no_content" };

type GenerationEntry = {
  step: string;
  module_id?: string;
  prompt_id: string;
  prompt_version: number;
  model: string;
  ai_usage_id: number | null;
};

function entry(step: string, meta: AiRunMeta, moduleId?: string): GenerationEntry {
  return {
    step,
    ...(moduleId ? { module_id: moduleId } : {}),
    prompt_id: meta.promptId,
    prompt_version: meta.promptVersion,
    model: meta.model,
    ai_usage_id: meta.usageId,
  };
}

async function appendGeneration(hr: HrContext, trainingId: string, item: GenerationEntry) {
  const { data } = await hr.supabase
    .from("trainings")
    .select("generation")
    .eq("id", trainingId)
    .maybeSingle();
  const current = Array.isArray(data?.generation) ? data.generation : [];
  await hr.supabase
    .from("trainings")
    .update({ generation: [...current, item] as unknown as Json })
    .eq("id", trainingId);
}

async function loadTraining(hr: HrContext, trainingId: string) {
  const { data } = await hr.supabase
    .from("trainings")
    .select("id, org_id, title, description, topic, audience, status")
    .eq("id", trainingId)
    .eq("org_id", hr.org.id)
    .maybeSingle();
  return data;
}

/**
 * Texto de las fuentes: los ficheros subidos se extraen la primera vez (con la
 * sesión de RRHH) y se guarda una instantánea; los documentos de la FAQ ya se
 * copiaron al crear la formación.
 */
export async function loadSourceText(
  hr: HrContext,
  trainingId: string,
): Promise<StepResult<string | null>> {
  const { data: sources } = await hr.supabase
    .from("training_sources")
    .select("id, kind, title, file_path, file_mime, content")
    .eq("training_id", trainingId)
    .order("created_at", { ascending: true });

  for (const source of sources ?? []) {
    if (source.kind !== "upload" || source.content || !source.file_path || !source.file_mime) {
      continue;
    }
    const { data: blob, error } = await hr.supabase.storage
      .from(TRAINING_BUCKET)
      .download(source.file_path);
    if (error || !blob) return { ok: false, reason: "source", code: "storage_error" };
    try {
      const { pages } = await extractDocumentPages(
        new Uint8Array(await blob.arrayBuffer()),
        source.file_mime,
      );
      source.content = pages
        .map((page) => page.text)
        .join("\n\n")
        .slice(0, MAX_STORED_SOURCE_CHARS);
    } catch (extractionError) {
      return {
        ok: false,
        reason: "source",
        code: isExtractionError(extractionError) ? extractionError.code : "unreadable",
      };
    }
    await hr.supabase
      .from("training_sources")
      .update({ content: source.content })
      .eq("id", source.id);
  }

  return {
    ok: true,
    data: buildSourceText(
      (sources ?? []).map((source) => ({ title: source.title, content: source.content })),
    ),
  };
}

/** Paso 1: índice (título, descripción y módulos). Solo en un borrador sin módulos. */
export async function generateOutline(
  hr: HrContext,
  trainingId: string,
  options: { moduleCount: number; keepTitle: boolean },
): Promise<StepResult<{ modules: { id: string; title: string }[] }>> {
  const training = await loadTraining(hr, trainingId);
  if (!training) return { ok: false, reason: "state", code: "not_found" };
  const { count } = await hr.supabase
    .from("training_modules")
    .select("id", { count: "exact", head: true })
    .eq("training_id", trainingId);
  if (training.status !== "draft" || (count ?? 0) > 0) {
    return { ok: false, reason: "state", code: "locked" };
  }

  const sourceText = await loadSourceText(hr, trainingId);
  if (!sourceText.ok) return sourceText;

  try {
    const result = await generateObject(
      trainingOutlineV1,
      {
        topic: training.topic,
        audience: training.audience,
        sourceText: sourceText.data,
        moduleCount: options.moduleCount,
      },
      hr.aiContext,
    );

    await hr.supabase
      .from("trainings")
      .update({
        ...(options.keepTitle ? {} : { title: result.data.title }),
        description: result.data.description,
      })
      .eq("id", trainingId);

    const { data: modules, error } = await hr.supabase
      .from("training_modules")
      .insert(
        result.data.modules.map((module, index) => ({
          org_id: training.org_id,
          training_id: trainingId,
          position: index + 1,
          title: module.title,
          objective: module.objective,
        })),
      )
      .select("id, title, position");
    if (error || !modules) throw new Error(`No se pudieron guardar los módulos: ${error?.message}`);

    await appendGeneration(hr, trainingId, entry("outline", result.meta));
    return {
      ok: true,
      data: {
        modules: [...modules]
          .sort((a, b) => a.position - b.position)
          .map((module) => ({ id: module.id, title: module.title })),
      },
    };
  } catch (error) {
    if (isAiError(error)) return { ok: false, reason: "ai", message: error.userMessage };
    throw error;
  }
}

/** Paso 2: contenido, ejemplos y resumen de un módulo. */
export async function generateModuleContent(
  hr: HrContext,
  trainingId: string,
  moduleId: string,
): Promise<StepResult> {
  const training = await loadTraining(hr, trainingId);
  if (!training) return { ok: false, reason: "state", code: "not_found" };
  const { data: modules } = await hr.supabase
    .from("training_modules")
    .select("id, position, title, objective")
    .eq("training_id", trainingId)
    .order("position", { ascending: true });
  const target = modules?.find((item) => item.id === moduleId);
  if (!target) return { ok: false, reason: "state", code: "not_found" };

  const sourceText = await loadSourceText(hr, trainingId);
  if (!sourceText.ok) return sourceText;

  try {
    const result = await generateObject(
      trainingModuleV1,
      {
        trainingTitle: training.title,
        moduleTitle: target.title,
        objective: target.objective,
        position: target.position,
        otherModules: (modules ?? [])
          .filter((item) => item.id !== moduleId)
          .map((item) => item.title),
        audience: training.audience,
        sourceText: sourceText.data,
      },
      hr.aiContext,
    );
    const { error } = await hr.supabase
      .from("training_modules")
      .update({
        content: result.data.content,
        examples: result.data.examples as unknown as Json,
        summary: result.data.summary,
      })
      .eq("id", moduleId);
    if (error) throw new Error(`No se pudo guardar el módulo: ${error.message}`);
    await appendGeneration(hr, trainingId, entry("module", result.meta, moduleId));
    return { ok: true, data: undefined };
  } catch (error) {
    if (isAiError(error)) return { ok: false, reason: "ai", message: error.userMessage };
    throw error;
  }
}

/** Paso 3: test con explicaciones (se guarda con save_training_quiz). */
export async function generateQuiz(
  hr: HrContext,
  trainingId: string,
  questionCount: number,
): Promise<StepResult> {
  const training = await loadTraining(hr, trainingId);
  if (!training) return { ok: false, reason: "state", code: "not_found" };
  const { data: modules } = await hr.supabase
    .from("training_modules")
    .select("title, summary, content")
    .eq("training_id", trainingId)
    .order("position", { ascending: true });
  const withContent = (modules ?? []).filter((module) => module.content.trim());
  if (withContent.length === 0) return { ok: false, reason: "state", code: "no_content" };

  try {
    const result = await generateObject(
      trainingQuizV1,
      {
        trainingTitle: training.title,
        modules: withContent.map((module) => ({
          title: module.title,
          summary: module.summary,
          content: module.content.slice(0, 6000),
        })),
        questionCount,
      },
      hr.aiContext,
    );
    const { error } = await hr.supabase.rpc("save_training_quiz", {
      p_training_id: trainingId,
      p_questions: result.data.questions.map((question) => ({
        question: question.question,
        options: question.options,
        correct_index: question.correctIndex,
        explanation: question.explanation,
      })) as unknown as Json,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "state", code: "locked" };
      throw new Error(`No se pudo guardar el test: ${error.message}`);
    }
    await appendGeneration(hr, trainingId, entry("quiz", result.meta));
    return { ok: true, data: undefined };
  } catch (error) {
    if (isAiError(error)) return { ok: false, reason: "ai", message: error.userMessage };
    throw error;
  }
}
