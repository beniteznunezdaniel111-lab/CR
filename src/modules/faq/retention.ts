import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FAQ_RETENTION_MONTHS } from "./constants";

/** Fecha límite: lo que no ha tenido actividad desde entonces se borra. */
export function faqRetentionCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - FAQ_RETENTION_MONTHS);
  return cutoff;
}

/**
 * Borra las conversaciones de la FAQ sin actividad en 12 meses (sus mensajes,
 * en cascada) y los avisos de más de 12 meses. Lo ejecuta el cron diario
 * (/api/cron/retention) con la clave de servidor. Sin auditoría por
 * conversación: son datos privados de cada persona y no se registran.
 */
export async function purgeOldFaqData(now = new Date()) {
  const admin = createAdminClient();
  const cutoff = faqRetentionCutoff(now).toISOString();

  const { count: conversations, error } = await admin
    .from("faq_conversations")
    .delete({ count: "exact" })
    .lt("updated_at", cutoff);
  if (error)
    throw new Error(`Retención FAQ: no se pudieron borrar conversaciones: ${error.message}`);

  const { count: notifications, error: notificationsError } = await admin
    .from("notifications")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (notificationsError) {
    throw new Error(`Retención FAQ: no se pudieron borrar avisos: ${notificationsError.message}`);
  }

  return { conversations: conversations ?? 0, notifications: notifications ?? 0 };
}
