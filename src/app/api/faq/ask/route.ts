/**
 * Pregunta a la FAQ interna con respuesta en streaming (NDJSON: un evento JSON
 * por línea). Lo usa el chat de /app/[org]/faq. Exige sesión y ser miembro
 * activo de la empresa; todo se lee y escribe con la sesión de la persona.
 */
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireMemberContext } from "@/lib/auth/hr-context";
import { type AskEvent, askFaq } from "@/modules/faq/ask";
import { askSchema } from "@/modules/faq/schemas";

export const maxDuration = 60;

function json(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const t = await getTranslations("faq.chat");

  // Solo peticiones JSON del propio sitio (un formulario de otra web no puede).
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json(415, t("errors.generic"));
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return json(403, t("errors.generic"));

  const user = await getCurrentUser();
  if (!user) return json(401, t("errors.session"));

  const parsed = askSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, t("errors.question"));

  const member = await requireMemberContext(parsed.data.orgId);
  if (!member) return json(404, t("errors.generic"));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // El navegador ya cerró la conexión.
        }
      };
      try {
        await askFaq(member, parsed.data, send, request.signal);
      } catch (error) {
        console.error("[faq] Error inesperado:", error);
        send({ type: "error", message: t("errors.generic") });
      } finally {
        try {
          controller.close();
        } catch {
          // Ya cerrado.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
