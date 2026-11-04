import { z } from "zod";
import { detectContacts } from "@/lib/privacy/redaction";
import { definePrompt } from "../../types";
import { asData, baseSystemPrompt } from "../shared";

export const cvIdentityInputSchema = z.object({
  cvText: z.string().min(1).max(60000),
});

export const cvIdentityOutputSchema = z.object({
  fullName: z.string().max(200).nullable(),
  email: z.string().max(254).nullable(),
  phone: z.string().max(60).nullable(),
  location: z.string().max(200).nullable(),
  links: z.array(z.string().max(300)).max(10),
});

export type CvIdentityOutput = z.infer<typeof cvIdentityOutputSchema>;

/**
 * Paso 1 del análisis de un CV: localizar los datos identificativos y de
 * contacto para guardarlos aparte y quitarlos del texto que evalúa la IA.
 * Es lo único que ve el CV original; no evalúa nada.
 */
export const cvIdentityV1 = definePrompt({
  id: "cv.identity",
  version: 1,
  feature: "candidates",
  description: "Localiza nombre y datos de contacto de un CV para anonimizarlo",
  effort: "low",
  maxOutputTokens: 1500,
  input: cvIdentityInputSchema,
  output: cvIdentityOutputSchema,
  system: (ctx) =>
    [
      baseSystemPrompt(ctx),
      "",
      "Tu única tarea: copiar del CV los datos que identifican o permiten contactar a la persona candidata, para que el sistema los oculte antes de evaluarlo.",
      "- fullName: nombre y apellidos tal como aparecen.",
      "- email, phone: tal como aparecen (si hay varios, el principal).",
      "- location: dirección postal o localidad de residencia, si aparece.",
      "- links: enlaces personales (LinkedIn, GitHub, web, portfolio...).",
      "Copia los datos literalmente. Si un dato no aparece, devuelve null (o una lista vacía). No inventes ni deduzcas nada.",
      "No extraigas ningún otro dato: ni edad, fecha de nacimiento, nacionalidad, estado civil, foto, salud ni ningún otro atributo personal. No evalúes el CV.",
    ].join("\n"),
  user: (input) => asData("cv", input.cvText),
  mock: (input) => detectContacts(input.cvText),
});
